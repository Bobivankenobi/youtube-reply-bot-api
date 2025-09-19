import express from 'express';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

// Directory for storing AI responses
const AI_RESPONSE_DIR = path.join(__dirname, '..', 'aiResponseFinalScoreData');

// Ensure the directory exists
if (!fs.existsSync(AI_RESPONSE_DIR)) {
  fs.mkdirSync(AI_RESPONSE_DIR, { recursive: true });
}

// Types for comment structure
interface Comment {
  id: number;
  t: string; // timeAgo in days (e.g., "30" means 30 days ago)
  c: string; // comment
  l: string; // likes
  r: string; // replies
}

// {
//   "id": 253,
//   "t": "30",
//   "c": "I've found my hands work better than a brayer to stick the material to the mat. I think it's the heat from your hands that helps it to stick?",
//   "l": "0",
//   "r": "0"
// }

interface CommentScore {
  finalScore: number;
}

interface AnalysisResponse {
  [id: string]: CommentScore;
}

// Default system message (fallback)
const DEFAULT_SYSTEM_MESSAGE = `You are an evaluator for YouTube comments targeting opportunities to provide value and subtly promote svgotter.com.

The input is an array of objects with the following schema:
- id: numeric identifier
- t: time ago in days (string number like "1", "30", "90" representing days ago)
- c: full comment text
- l: number of likes (string, may be "0")
- r: number of replies (string, may be "0")

Your job is to calculate a finalScore for each comment to identify the BEST opportunities for valuable replies that could subtly promote svgotter.com.

Scoring rules:
1. **Freshness**: Newer comments get higher points. 
   - 1 day ago ≈ 100 pts, 7 days ago ≈ 85 pts, 30 days ago ≈ 60 pts, 90 days ago ≈ 40 pts, older gradually lower.
2. **Engagement**: More likes/replies = higher score. 
   - Each like ≈ 1 pt, each reply ≈ 5 pts. Cap at +50.
3. **Reply Opportunity**: Add +40 if the comment shows:
   - Frustration, complaint, or a need that could be solved
   - Questions about tools, resources, or solutions
   - Discussion about productivity, efficiency, or workflow
   - Mentions of problems that svgotter.com could address
4. **High Value Engagement**: Add +25 if it's:
   - Clearly positive and engaged
   - Shows appreciation for helpful content
   - Indicates they're looking for more resources/tools
5. **Community Building**: Add +15 if the comment:
   - Shows they're part of a community we want to serve
   - Indicates they're creators, developers, or entrepreneurs
   - Shows they value efficiency and good tools

Normalize all scores into a 0–100 range.

Return ONLY JSON in this shape:
{
  "<id>": { "finalScore": <number> },
  "<id>": { "finalScore": <number> }
}`;

// Validation function
function validateComments(comments: any[]): comments is Comment[] {
  if (!Array.isArray(comments)) return false;
  if (comments.length === 0 || comments.length > 50) return false;
  
  return comments.every(comment => 
    typeof comment === 'object' &&
    typeof comment.id === 'number' &&
    typeof comment.t === 'string' &&
    typeof comment.c === 'string' &&
    typeof comment.l === 'string' &&
    typeof comment.r === 'string'
  );
}

app.post('/analyze-comments', async (req, res) => {
  console.log('📥 /analyze-comments route hit');
  
  // Note: Directory clearing is now handled by /clear-analysis-data endpoint
  // This ensures clearing happens before batch requests start
  
  const { comments, systemMessage, bestCommentsCount } = req.body;
  
  // Validation
  if (!validateComments(comments)) {
    console.error('❌ Invalid comments format');
    return res.status(400).json({ 
      error: 'Invalid comments format. Expected array of objects with fields: id, t, c, l, r. Max 50 comments.' 
    });
  }

  // Validate systemMessage
  if (!systemMessage || typeof systemMessage !== 'string') {
    console.error('❌ Invalid systemMessage format');
    return res.status(400).json({ 
      error: 'systemMessage is required and must be a string.' 
    });
  }

  // Validate bestCommentsCount
  if (bestCommentsCount === undefined || typeof bestCommentsCount !== 'number' || bestCommentsCount < 1) {
    console.error('❌ Invalid bestCommentsCount format');
    return res.status(400).json({ 
      error: 'bestCommentsCount is required and must be a positive number.' 
    });
  }

  console.log(`📊 Analyzing ${comments.length} comments`);
  console.log(`🎯 Best comments count: ${bestCommentsCount}`);
  console.log(`📝 Using custom system message: ${systemMessage.length} characters`);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: JSON.stringify(comments) }
      ]
    });

    const rawResponse = completion.choices[0].message.content ?? '';
    console.log('📤 Raw OpenAI response:', rawResponse);

    let parsedResponse: AnalysisResponse;
    try {
      // Clean up the response in case it has markdown formatting
      const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedResponse = JSON.parse(cleaned);
    } catch (err) {
      console.error('❌ Failed to parse OpenAI response as JSON:', err);
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    // Save the response to JSON file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `analysis_${timestamp}.json`;
    const filepath = path.join(AI_RESPONSE_DIR, filename);
    
    const responseData = {
      timestamp: new Date().toISOString(),
      inputComments: comments,
      systemMessage: systemMessage,
      bestCommentsCount: bestCommentsCount,
      analysisResults: parsedResponse
    };
    
    try {
      fs.writeFileSync(filepath, JSON.stringify(responseData, null, 2));
      console.log(`💾 Response saved to: ${filename}`);
    } catch (writeErr) {
      console.warn('⚠️ Failed to save response to file:', writeErr);
    }

    console.log('✅ Successfully analyzed comments');
    return res.json(parsedResponse);

  } catch (err) {
    console.error('❌ OpenAI API error:', err);
    return res.status(500).json({ error: 'Failed to analyze comments' });
  }
});

// Clear analysis data endpoint
app.post('/clear-analysis-data', (req, res) => {
  console.log('🗑️ /clear-analysis-data route hit');
  
  try {
    if (fs.existsSync(AI_RESPONSE_DIR)) {
      const files = fs.readdirSync(AI_RESPONSE_DIR);
      for (const file of files) {
        const filePath = path.join(AI_RESPONSE_DIR, file);
        fs.unlinkSync(filePath);
      }
      console.log(`🗑️ Cleared ${files.length} old analysis files`);
      res.json({ 
        success: true, 
        message: `Cleared ${files.length} old analysis files`,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('📁 Analysis directory does not exist, nothing to clear');
      res.json({ 
        success: true, 
        message: 'Analysis directory does not exist, nothing to clear',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Failed to clear analysis files:', error);
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    res.status(500).json({ 
      error: 'Failed to clear analysis files',
      details: errorMessage
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ YouTube Reply Bot API running at http://localhost:${PORT}`);
  console.log(`📊 Endpoint: POST /analyze-comments`);
  console.log(`🗑️ Clear endpoint: POST /clear-analysis-data`);
  console.log(`🏥 Health check: GET /health`);
});