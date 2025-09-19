import fs from 'fs';
import path from 'path';

interface Comment {
  id: number;
  t: string; // timeAgo in days (e.g., "30" means 30 days ago)
  c: string; // comment
  l: string; // likes
  r: string; // replies
}

interface CommentScore {
  finalScore: number;
}

interface AnalysisFile {
  timestamp: string;
  inputComments: Comment[];
  analysisResults: { [id: string]: CommentScore };
}

interface MergedComment extends Comment {
  finalScore: number;
  analysisTimestamp: string;
}

// Directory paths
const AI_RESPONSE_DIR = path.join(__dirname, '..', 'aiResponseFinalScoreData');
const OUTPUT_DIR = path.join(__dirname, '..', 'mergedResults');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function getAllAnalysisFiles(): string[] {
  try {
    const files = fs.readdirSync(AI_RESPONSE_DIR);
    return files.filter(file => file.endsWith('.json'));
  } catch (error) {
    console.error('❌ Error reading analysis directory:', error);
    return [];
  }
}

function readAnalysisFile(filename: string): AnalysisFile | null {
  try {
    const filepath = path.join(AI_RESPONSE_DIR, filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content) as AnalysisFile;
  } catch (error) {
    console.error(`❌ Error reading file ${filename}:`, error);
    return null;
  }
}

function mergeCommentsWithScores(analysisFile: AnalysisFile): MergedComment[] {
  const mergedComments: MergedComment[] = [];
  
  for (const comment of analysisFile.inputComments) {
    const scoreData = analysisFile.analysisResults[comment.id.toString()];
    
    if (scoreData) {
      mergedComments.push({
        ...comment,
        finalScore: scoreData.finalScore,
        analysisTimestamp: analysisFile.timestamp
      });
    } else {
      console.warn(`⚠️ No score found for comment ID ${comment.id} in file`);
    }
  }
  
  return mergedComments;
}

function sortCommentsByScore(comments: MergedComment[]): MergedComment[] {
  return comments.sort((a, b) => b.finalScore - a.finalScore);
}

function generateOutputFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `merged_scores_${timestamp}.json`;
}

function main() {
  console.log('🔄 Starting merge and sort process...');
  
  // Get all analysis files
  const analysisFiles = getAllAnalysisFiles();
  
  if (analysisFiles.length === 0) {
    console.log('❌ No analysis files found in the directory');
    return;
  }
  
  console.log(`📁 Found ${analysisFiles.length} analysis files`);
  
  const allMergedComments: MergedComment[] = [];
  let totalComments = 0;
  let processedFiles = 0;
  
  // Process each analysis file
  for (const filename of analysisFiles) {
    console.log(`📄 Processing: ${filename}`);
    
    const analysisFile = readAnalysisFile(filename);
    if (!analysisFile) {
      continue;
    }
    
    const mergedComments = mergeCommentsWithScores(analysisFile);
    allMergedComments.push(...mergedComments);
    
    totalComments += mergedComments.length;
    processedFiles++;
    
    console.log(`   ✅ Processed ${mergedComments.length} comments`);
  }
  
  if (allMergedComments.length === 0) {
    console.log('❌ No comments with scores found');
    return;
  }
  
  // Sort by final score (highest to lowest)
  console.log('🔄 Sorting comments by final score...');
  const sortedComments = sortCommentsByScore(allMergedComments);
  
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
  const outputFilename = generateOutputFilename();
  const outputPath = path.join(OUTPUT_DIR, outputFilename);
  
  try {
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    
    console.log('✅ Merge and sort completed successfully!');
    console.log(`📊 Results:`);
    console.log(`   - Total comments: ${totalComments}`);
    console.log(`   - Processed files: ${processedFiles}`);
    console.log(`   - Highest score: ${outputData.metadata.scoreRange.highest}`);
    console.log(`   - Lowest score: ${outputData.metadata.scoreRange.lowest}`);
    console.log(`💾 Output saved to: ${outputFilename}`);
    
    // Show top 5 comments
    console.log('\n🏆 Top 5 highest scoring comments:');
    sortedComments.slice(0, 5).forEach((comment, index) => {
      console.log(`${index + 1}. Score: ${comment.finalScore} | ID: ${comment.id}`);
      console.log(`   Comment: ${comment.c.substring(0, 100)}${comment.c.length > 100 ? '...' : ''}`);
      console.log(`   Likes: ${comment.l}, Replies: ${comment.r}, Time: ${comment.t}\n`);
    });
    
  } catch (error) {
    console.error('❌ Error writing output file:', error);
  }
}

// Run the script
if (require.main === module) {
  main();
}

export { main };