# Trash Talk AI - WarzoneWarrior Post-Match Generator

An AI-powered Cloudflare Worker that generates authentic, introspective trash talk for WarzoneWarrior matches. Built with Cloudflare Workers AI and D1 database for real-time conversation tracking and batch generation.

## 🎯 What It Does

Trash Talk AI creates realistic post-match dialogue between two players after a WarzoneWarrior battle royale match. Unlike generic trash talk generators, this system produces **authentic, screenshot-worthy lines** that feel like real player conversations - confident winners analyzing their dominance, and resilient losers already planning their comeback.

### Key Features

- **AI-Powered Generation**: Uses Meta Llama 3.1 70B Instruct via Cloudflare Workers AI
- **Contextual Conversations**: Maintains conversation history across multiple exchanges
- **Player Profiles**: Supports player names, kill counts, and coin earnings
- **Batch Processing**: Generates multiple line pairs for extended conversations
- **Database Persistence**: Stores chat logs and generation batches in Cloudflare D1
- **Real-time API**: RESTful endpoints for seamless integration

## 🤖 How the AI Works

### The Core Algorithm

The AI generates trash talk through a sophisticated prompt engineering approach that creates two distinct voices:

#### Winner Voice (Player 1)
- **Personality**: Confident, analytical, self-assured
- **Style**: 2-4 sentences per line, focused on decision-making and preparation
- **Examples**:
  - "Every move I made tonight had a reason behind it. They were reacting, I was deciding — and that's a gap you can't close in one match."
  - "I don't celebrate after wins anymore. I just close the tab, make a note, and move on. There's nothing to celebrate when you performed exactly the way you prepared to."

#### Loser Voice (Player 2)
- **Personality**: Resilient, introspective, comeback-focused
- **Style**: 2-4 sentences per line, honest about the loss but already moving forward
- **Examples**:
  - "They were better tonight and I mean that with no bitterness at all. I'm sitting here thinking about three moments that decided the whole thing — and none of them are mistakes I'll ever make again."
  - "A loss only hurts if you learn nothing from it. I already know what broke and when and why. That kind of honesty is rare, and right now it's the only thing I'm taking out of this match."

### Technical Implementation

#### Prompt Engineering
The system uses a detailed prompt that includes:
- Match result context (winner/loser profiles)
- Conversation history (previous exchanges)
- Style guidelines and examples
- Output format specifications (JSON arrays)

#### AI Model Configuration
```javascript
const aiResponse = await env.AI.run("@cf/meta/llama-3.1-70b-instruct", {
    max_tokens: 2048,
    messages: [
        {
            role: "system",
            content: "You write post-match trash talk for WarzoneWarrior..."
        },
        {
            role: "user",
            content: detailedPrompt
        }
    ]
});
```

#### Response Processing
- Extracts JSON from AI response using regex pattern matching
- Validates response structure (exactly 5 lines per player)
- Handles malformed responses gracefully
- Stores successful generations in database

## 🏗️ Architecture

### Technology Stack

- **Runtime**: Cloudflare Workers (serverless functions)
- **AI**: Cloudflare Workers AI (Meta Llama 3.1 70B Instruct)
- **Database**: Cloudflare D1 (SQLite-compatible)
- **Language**: JavaScript (ES Modules)
- **Testing**: Vitest with Cloudflare Workers test environment
- **Deployment**: Wrangler CLI

### Database Schema

#### Chat Lines Table
```sql
CREATE TABLE chat_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    speaker TEXT NOT NULL, -- 'player1' or 'player2'
    content TEXT NOT NULL,
    seq INTEGER NOT NULL, -- sequence number for ordering
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

#### Generation Batches Table
```sql
CREATE TABLE generate_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    batch_index INTEGER NOT NULL,
    player1_json TEXT NOT NULL, -- JSON array of winner lines
    player2_json TEXT NOT NULL, -- JSON array of loser lines
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### API Endpoints

#### GET /
Health check endpoint returning service status and configuration.

**Response:**
```json
{
  "success": true,
  "message": "WarzoneWarrior Trash Talk AI is running",
  "meta": {
    "linesPerBatch": 5,
    "refillAfterPairsConsumed": 2
  }
}
```

#### POST /generate
Generates a new batch of trash talk lines.

**Request Body:**
```json
{
  "player1": "WinnerName",
  "player2": "LoserName",
  "context": "Optional match context",
  "sessionId": "optional-session-id",
  "batchIndex": 0,
  "history": {
    "player1": ["previous line 1", "previous line 2"],
    "player2": ["previous response 1", "previous response 2"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "meta": {
    "linesPerBatch": 5,
    "refillAfterPairsConsumed": 2,
    "batchIndex": 0,
    "sessionId": "session-123"
  },
  "players": {
    "player1": { "name": "WinnerName" },
    "player2": { "name": "LoserName" }
  },
  "player1": ["Winner line 1", "Winner line 2", ...],
  "player2": ["Loser line 1", "Loser line 2", ...]
}
```

#### GET /chat?sessionId=xyz
Retrieves chat history for a session.

**Response:**
```json
{
  "success": true,
  "sessionId": "xyz",
  "lines": [
    {
      "speaker": "player1",
      "content": "Winner line",
      "seq": 1,
      "created_at": 1640995200
    }
  ]
}
```

#### POST /chat/log
Logs chat lines to the database.

**Request Body:**
```json
{
  "sessionId": "xyz",
  "lines": [
    {
      "speaker": "player1",
      "text": "Chat message",
      "seq": 1
    }
  ]
}
```

## 🚀 Installation & Setup

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers enabled
- Wrangler CLI: `npm install -g wrangler`

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/dhruv17cs-coder/trash-talk.git
   cd trash-talk-worker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Wrangler**
   ```bash
   wrangler auth login
   ```

4. **Set up D1 Database** (optional for local development)
   ```bash
   wrangler d1 create trash-talk-chat
   # Update wrangler.jsonc with the database_id
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

### Testing

```bash
npm test
```

The test suite includes:
- Health check endpoint validation
- Input validation for generate endpoint
- Error handling for malformed requests

## 📦 Deployment

### Cloudflare Workers Deployment

1. **Deploy to Cloudflare**
   ```bash
   npm run deploy
   ```

2. **Configure AI Binding**
   Ensure your Cloudflare account has Workers AI enabled and the binding is configured in `wrangler.jsonc`.

3. **Database Migration**
   ```bash
   wrangler d1 execute trash-talk-chat --file=migrations/0001_init.sql
   ```

### Environment Variables

The worker uses the following bindings (configured in `wrangler.jsonc`):

- `AI`: Cloudflare Workers AI binding
- `DB`: D1 database binding for chat persistence

## 🔧 Development

### Project Structure

```
trash-talk-worker/
├── src/
│   └── index.js          # Main worker logic
├── test/
│   └── index.spec.js     # Test suite
├── migrations/
│   └── 0001_init.sql     # Database schema
├── wrangler.jsonc        # Cloudflare configuration
├── package.json          # Dependencies and scripts
└── README.md            # This file
```

### Key Components

#### Player Normalization (`normalizePlayer`)
Converts various input formats into standardized player objects:
- String names: `"PlayerName"`
- Object format: `{ name: "PlayerName", coin: 1500, kills: 12 }`

#### Volley History Parsing (`parseVolleyHistory`)
Validates and processes conversation history for context-aware generation.

#### AI Response Extraction (`extractJson`)
Robust JSON extraction from AI responses using regex patterns and fallback parsing.

### Adding New Features

1. **New Endpoints**: Add route handlers in the main `fetch` function
2. **Database Changes**: Create new migration files in `migrations/`
3. **AI Prompts**: Modify the prompt template in `/generate` endpoint
4. **Validation**: Add input validation functions following existing patterns

## 🎮 Usage Examples

### Basic Generation
```javascript
const response = await fetch('https://your-worker.workers.dev/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    player1: { name: "ProGamer", kills: 15, coin: 2500 },
    player2: { name: "CasualPlayer", kills: 8, coin: 1200 },
    context: "Close match on Rebirth Island"
  })
});

const result = await response.json();
// Returns 5 lines from winner, 5 lines from loser
```

### Conversation Continuation
```javascript
// After generating initial batch, continue conversation
const nextBatch = await fetch('https://your-worker.workers.dev/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    player1: "ProGamer",
    player2: "CasualPlayer",
    sessionId: "session-123",
    batchIndex: 1,
    history: {
      player1: result.player1.slice(0, 2), // First 2 lines used
      player2: result.player2.slice(0, 2)
    }
  })
});
```

## 🤝 Contributing

### Development Guidelines

1. **Code Style**: Follow existing patterns and use descriptive variable names
2. **Testing**: Add tests for new features and bug fixes
3. **Documentation**: Update this README for API changes
4. **Database**: Use migrations for schema changes

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass
5. Update documentation if needed
6. Submit a pull request

### Areas for Contribution

- **AI Prompt Optimization**: Improve trash talk quality and authenticity
- **Additional Game Modes**: Support for different Warzone modes
- **Multi-language Support**: Localization for different regions
- **Rate Limiting**: Prevent abuse and ensure fair usage
- **Analytics**: Track generation patterns and success rates

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Important Notes

- **Content Guidelines**: All generated content follows strict guidelines - no hate speech, slurs, or inappropriate content
- **Game Respect**: Never insults the game, developers, or WarzoneWarrior as a product
- **Ethical AI**: Promotes positive gaming culture through authentic, respectful trash talk
- **Performance**: Designed for low-latency responses using Cloudflare's global network

## 🆘 Troubleshooting

### Common Issues

**"Workers AI binding missing"**
- Ensure AI binding is configured in `wrangler.jsonc`
- Verify Cloudflare account has Workers AI enabled

**"Database not configured"**
- Check D1 database binding in configuration
- Run database migrations if deploying fresh

**"Model returned invalid JSON"**
- AI response parsing failed - usually temporary
- System automatically retries on malformed responses

### Support

For issues or questions:
1. Check existing GitHub issues
2. Create a new issue with detailed error information
3. Include your Wrangler version and deployment environment

---

**Built with ❤️ for the WarzoneWarrior community**</content>
<parameter name="filePath">/Users/rishabhjaiswal/Code/Personal/Karn/trash-talk-worker/README.md