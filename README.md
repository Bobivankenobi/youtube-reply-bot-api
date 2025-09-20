# YouTube Reply Bot API

An API for analyzing YouTube comments to identify the best opportunities for valuable replies that can subtly promote svgotter.com.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your OpenAI API key:
```bash
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

3. Run the development server:
```bash
npm run dev
```

## API Endpoints

### POST /analyze-comments

Analyzes up to 50 YouTube comments and returns scores for reply opportunities.

**Request Body:**
```json
{
  "comments": [
    {
      "id": 1,
      "t": "30",
      "c": "Comment text here",
      "l": "46",
      "r": "5"
    }
  ],
  "systemMessage": "Your custom system message for OpenAI",
  "bestCommentsCount": 10
}
```

**Response:**
```json
{
  "1": { "finalScore": 87 },
  "2": { "finalScore": 42 }
}
```

**Field Descriptions:**
- `comments`: Array of comment objects
- `systemMessage`: Custom system message for OpenAI (string)
- `bestCommentsCount`: Number of best comments to return (number)

**Comment Object Fields:**
- `id`: Numeric identifier
- `t`: Time ago in days (e.g., "30" means 30 days ago)
- `c`: Comment text
- `l`: Number of likes (string)
- `r`: Number of replies (string)
- `isTopComments`: Optional boolean flag for top comments (gets score 100 automatically)

### GET /health

Health check endpoint.

## Scoring Algorithm

The API scores comments based on:
1. **Freshness**: Newer comments get higher scores
2. **Engagement**: Likes and replies boost scores
3. **Reply Opportunity**: Comments showing frustration, questions, or needs get bonus points
4. **High Value Engagement**: Positive, engaged comments get bonus points
5. **Community Building**: Comments from target audience get bonus points

Scores are normalized to 0-100 range.