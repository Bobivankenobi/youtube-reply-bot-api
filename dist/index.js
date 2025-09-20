"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const openai_1 = require("openai");
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
const openai = new openai_1.OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
// Directory for storing AI responses
const AI_RESPONSE_DIR = path_1.default.join(__dirname, '..', 'aiResponseFinalScoreData');
const MERGED_RESULTS_DIR = path_1.default.join(__dirname, '..', 'mergedResults');
// Ensure the directories exist
if (!fs_1.default.existsSync(AI_RESPONSE_DIR)) {
    fs_1.default.mkdirSync(AI_RESPONSE_DIR, { recursive: true });
}
if (!fs_1.default.existsSync(MERGED_RESULTS_DIR)) {
    fs_1.default.mkdirSync(MERGED_RESULTS_DIR, { recursive: true });
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
function validateComments(comments) {
    if (!Array.isArray(comments))
        return false;
    if (comments.length === 0 || comments.length > 50)
        return false;
    return comments.every(comment => typeof comment === 'object' &&
        typeof comment.id === 'number' &&
        typeof comment.t === 'string' &&
        typeof comment.c === 'string' &&
        typeof comment.l === 'string' &&
        typeof comment.r === 'string' &&
        (comment.isTopComments === undefined || typeof comment.isTopComments === 'boolean'));
}
// Function to merge and sort all analysis results
function mergeAndSortResults() {
    try {
        console.log('🔄 Starting merge and sort process...');
        // Get all analysis files
        const analysisFiles = fs_1.default.readdirSync(AI_RESPONSE_DIR).filter(file => file.endsWith('.json'));
        if (analysisFiles.length === 0) {
            console.log('❌ No analysis files found to merge');
            return;
        }
        console.log(`📁 Found ${analysisFiles.length} analysis files to merge`);
        const allMergedComments = [];
        let totalComments = 0;
        let processedFiles = 0;
        // Process each analysis file
        for (const filename of analysisFiles) {
            try {
                const filepath = path_1.default.join(AI_RESPONSE_DIR, filename);
                const content = fs_1.default.readFileSync(filepath, 'utf-8');
                const analysisFile = JSON.parse(content);
                // Merge comments with scores
                for (const comment of analysisFile.inputComments) {
                    const scoreData = analysisFile.analysisResults[comment.id.toString()];
                    if (scoreData) {
                        allMergedComments.push({
                            ...comment,
                            finalScore: scoreData.finalScore,
                            analysisTimestamp: analysisFile.timestamp
                        });
                    }
                }
                totalComments += analysisFile.inputComments.length;
                processedFiles++;
            }
            catch (error) {
                console.error(`❌ Error processing file ${filename}:`, error);
            }
        }
        if (allMergedComments.length === 0) {
            console.log('❌ No comments with scores found to merge');
            return;
        }
        // Remove duplicates by comment text, keeping the one with highest score
        console.log('🔄 Removing duplicates by comment text...');
        const uniqueComments = new Map();
        for (const comment of allMergedComments) {
            const existingComment = uniqueComments.get(comment.c);
            if (!existingComment || comment.finalScore > existingComment.finalScore) {
                uniqueComments.set(comment.c, comment);
            }
        }
        const deduplicatedComments = Array.from(uniqueComments.values());
        console.log(`📊 Removed ${allMergedComments.length - deduplicatedComments.length} duplicate comments`);
        // Sort by final score (highest to lowest)
        console.log('🔄 Sorting comments by final score...');
        const sortedComments = deduplicatedComments.sort((a, b) => b.finalScore - a.finalScore);
        // Create output data
        const outputData = {
            metadata: {
                generatedAt: new Date().toISOString(),
                totalComments: sortedComments.length,
                processedFiles: processedFiles,
                scoreRange: {
                    highest: sortedComments[0]?.finalScore || 0,
                    lowest: sortedComments[sortedComments.length - 1]?.finalScore || 0
                }
            },
            comments: sortedComments
        };
        // Write to output file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFilename = `merged_scores_${timestamp}.json`;
        const outputPath = path_1.default.join(MERGED_RESULTS_DIR, outputFilename);
        fs_1.default.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
        console.log('✅ Merge and sort completed successfully!');
        console.log(`📊 Results:`);
        console.log(`   - Total comments: ${totalComments}`);
        console.log(`   - Processed files: ${processedFiles}`);
        console.log(`   - Highest score: ${outputData.metadata.scoreRange.highest}`);
        console.log(`   - Lowest score: ${outputData.metadata.scoreRange.lowest}`);
        console.log(`💾 Output saved to: ${outputFilename}`);
    }
    catch (error) {
        console.error('❌ Error in merge and sort process:', error);
    }
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
    // Check if this batch contains top comments
    const hasTopComments = comments.some(comment => comment.isTopComments === true);
    const topComments = comments.filter(comment => comment.isTopComments === true);
    const regularComments = comments.filter(comment => !comment.isTopComments);
    console.log(`🏆 Found ${topComments.length} top comments (will get score 100)`);
    console.log(`📝 Found ${regularComments.length} regular comments (will be analyzed by AI)`);
    let parsedResponse = {};
    // Handle top comments - give them score 100 without AI analysis
    if (topComments.length > 0) {
        for (const comment of topComments) {
            parsedResponse[comment.id.toString()] = { finalScore: 101 };
        }
        console.log(`✅ Assigned score 100 to ${topComments.length} top comments`);
    }
    // Handle regular comments with AI analysis
    if (regularComments.length > 0) {
        try {
            const completion = await openai.chat.completions.create({
                model: 'gpt-5',
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: JSON.stringify(regularComments) }
                ]
            });
            const rawResponse = completion.choices[0].message.content ?? '';
            console.log('📤 Raw OpenAI response:', rawResponse);
            try {
                // Clean up the response in case it has markdown formatting
                const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                const aiResponse = JSON.parse(cleaned);
                // Merge AI response with top comments response
                Object.assign(parsedResponse, aiResponse);
            }
            catch (err) {
                console.error('❌ Failed to parse OpenAI response as JSON:', err);
                return res.status(500).json({ error: 'Failed to parse AI response' });
            }
        }
        catch (err) {
            console.error('❌ OpenAI API error:', err);
            return res.status(500).json({ error: 'Failed to analyze comments' });
        }
    }
    try {
        // Save the response to JSON file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `analysis_${timestamp}.json`;
        const filepath = path_1.default.join(AI_RESPONSE_DIR, filename);
        const responseData = {
            timestamp: new Date().toISOString(),
            inputComments: comments,
            systemMessage: systemMessage,
            bestCommentsCount: bestCommentsCount,
            analysisResults: parsedResponse
        };
        try {
            fs_1.default.writeFileSync(filepath, JSON.stringify(responseData, null, 2));
            console.log(`💾 Response saved to: ${filename}`);
        }
        catch (writeErr) {
            console.warn('⚠️ Failed to save response to file:', writeErr);
        }
        console.log('✅ Successfully analyzed comments');
        // After successful analysis, trigger merge and sort
        setTimeout(() => {
            mergeAndSortResults();
        }, 1000); // Small delay to ensure file is written
        return res.json(parsedResponse);
    }
    catch (err) {
        console.error('❌ General error:', err);
        return res.status(500).json({ error: 'Failed to analyze comments' });
    }
});
// Clear analysis data endpoint
app.post('/clear-analysis-data', (req, res) => {
    console.log('🗑️ /clear-analysis-data route hit');
    try {
        let clearedAnalysisFiles = 0;
        let clearedMergedFiles = 0;
        // Clear analysis files
        if (fs_1.default.existsSync(AI_RESPONSE_DIR)) {
            const files = fs_1.default.readdirSync(AI_RESPONSE_DIR);
            for (const file of files) {
                const filePath = path_1.default.join(AI_RESPONSE_DIR, file);
                fs_1.default.unlinkSync(filePath);
            }
            clearedAnalysisFiles = files.length;
            console.log(`🗑️ Cleared ${clearedAnalysisFiles} old analysis files`);
        }
        // Clear merged results files
        if (fs_1.default.existsSync(MERGED_RESULTS_DIR)) {
            const files = fs_1.default.readdirSync(MERGED_RESULTS_DIR);
            for (const file of files) {
                const filePath = path_1.default.join(MERGED_RESULTS_DIR, file);
                fs_1.default.unlinkSync(filePath);
            }
            clearedMergedFiles = files.length;
            console.log(`🗑️ Cleared ${clearedMergedFiles} old merged result files`);
        }
        res.json({
            success: true,
            message: `Cleared ${clearedAnalysisFiles} analysis files and ${clearedMergedFiles} merged result files`,
            clearedAnalysisFiles,
            clearedMergedFiles,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Failed to clear files:', error);
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        res.status(500).json({
            error: 'Failed to clear files',
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
