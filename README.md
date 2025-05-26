# Reg - AI Productivity Assistant

A sophisticated Electron-based AI chat application that combines multiple AI models with productivity tools, customizable personalities, and advanced features for enhanced workflow management.

## 🌟 Features

### 🤖 Multi-Model AI Support
- **OpenAI GPT Models**: GPT-4o, GPT-4o-Mini, GPT-4.1, GPT-4.5-preview
- **OpenAI Reasoning Models**: o3, o4-mini with configurable reasoning effort
- **Google Gemini**: Gemini 2.5 Flash
- Seamless model switching within conversations
- Real-time streaming responses with abort capability

### 🎭 Customizable AI Personalities
- **Pre-built Personalities**: Life coach, reviewer, brainstormer, roleplayer
- **Custom Personality Creation**: Define unique AI assistants with specific traits
- **Context-Aware Responses**: Personalities can access custom context sets
- **Tool Integration**: Each personality can have specific productivity tools enabled

### 🛠️ Integrated Productivity Tools
- **Note Management**: Create, organize, and archive notes
- **Event Scheduling**: Create and check calendar events
- **Timer & Alarm System**: Set timers and alarms with notifications
- **Notification System**: Cross-platform desktop notifications

### 📁 Advanced Context Management
- **File Upload Support**: PDF, DOCX, XLSX, CSV, RTF, TXT files
- **Context Sets**: Organize and manage different knowledge bases
- **Dynamic Context Loading**: Automatically include relevant context in conversations

### 💬 Enhanced Chat Experience
- **Message Editing**: Edit previous messages and regenerate responses
- **Chat History**: Persistent conversation storage with automatic titles
- **Real-time Streaming**: Live response generation with typing indicators
- **Token Usage Tracking**: Monitor API usage and costs

### 🎨 Customizable Interface
- **Multiple Themes**: Dark and light themes
- **Font Selection**: Choose from 6 carefully curated font families
- **Responsive Design**: Optimized for various screen sizes
- **Custom Window Controls**: Frameless design with custom title bar

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- OpenAI API key (for GPT models)
- Google AI API key (for Gemini models)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd reg
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure API Keys**
   
   Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   
   Or configure them through the application settings after first launch.

4. **Start the application**
   ```bash
   npm start
   ```

### Building for Production

```bash
# Build Tailwind CSS
npm run build:tailwind

# Build the application
npm run build
```

## 📖 Usage Guide

### Getting Started
1. Launch the application
2. Configure your API keys in Settings (⚙️ icon)
3. Select an AI personality from the personality selector
4. Start chatting!

### Creating Custom Personalities
1. Click the personality selector
2. Click the settings gear icon
3. Select "Create New Personality"
4. Configure:
   - Name and description
   - AI model to use
   - Custom prompt/instructions
   - Available context sets
   - Enabled productivity tools

### Managing Context
1. Upload files through the personality editor
2. Organize files into context sets
3. Assign context sets to personalities
4. Context is automatically included in relevant conversations

### Using Productivity Tools
Personalities can be equipped with various tools:
- **MakeNote**: Create and manage notes
- **CreateEvent**: Schedule calendar events
- **CheckEvents**: Query upcoming events
- **StartTimer**: Set countdown timers
- **CreateAlarm**: Set time-based alarms
- **CreateNotification**: Send desktop notifications

## 🏗️ Architecture

### Project Structure
```
projectReg/
├── src/
│   ├── actions/           # Productivity tool implementations
│   ├── config/           # Configuration management
│   ├── context/          # Context files
│   ├── main/             # Main process logic
│   ├── models/           # AI model implementations
│   ├── prompt/           # Personality prompts
│   ├── renderer/         # Frontend UI components
│   ├── services/         # Core services (storage, tracking)
│   ├── util/             # Utility functions
│   └── voice/            # Voice features (future)
├── data/                 # User data storage
├── config.json          # Application configuration
└── main.js              # Application entry point
```

### Key Components

#### AI Model Interface
- **AIModelInterface**: Abstract base class for AI implementations
- **GPTChat**: OpenAI GPT model implementation
- **GeminiChat**: Google Gemini model implementation
- **OpenAIReasoningChat**: OpenAI reasoning models (o3, o4-mini)

#### Chat Management
- **ChatManager**: Central chat state and model coordination
- **ChatStorage**: Persistent conversation storage
- **Message History**: Structured conversation tracking

#### Action System
- **ActionsManager**: Tool execution coordinator
- **ActionBase**: Base class for productivity tools
- Extensible architecture for adding new tools

## ⚙️ Configuration

### Model Configuration
Models are defined in `config.json`:
```json
{
  "availableModels": [
    {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "implementation": "gpt",
      "provider": "openai"
    }
  ]
}
```

### Personality Configuration
```json
{
  "personalities": [
    {
      "id": "custom-assistant",
      "name": "Custom Assistant",
      "promptId": "custom-prompt",
      "modelId": "gpt-4o",
      "tools": ["MakeNote", "CreateEvent"],
      "defaultContextSetIds": ["my-context"]
    }
  ]
}
```

## 🔧 Development

### Development Setup
```bash
# Install dependencies
npm install

# Start in development mode
npm start

# Watch Tailwind CSS changes
npm run build:tailwind
```

### Adding New AI Models
1. Create a new class extending `AIModelInterface`
2. Implement required methods: `initialize()`, `sendMessageStream()`, etc.
3. Add model configuration to `config.json`
4. Register in `ChatManager`

### Creating New Tools
1. Create a new class extending `ActionBase`
2. Implement `execute()` and `getSchema()` methods
3. Register in `ActionsManager`
4. Add to personality tool lists

### Customizing UI
- Modify Tailwind classes in `src/renderer/css/main.css`
- Update themes in `src/renderer/css/themes.css`
- Add new components in `src/renderer/components/`

## 🔒 Security & Privacy

- **Local Data Storage**: All conversations stored locally
- **API Key Security**: Keys stored securely in local configuration
- **No Data Transmission**: No user data sent to third parties beyond AI providers
- **Configurable Context**: Full control over what information is shared with AI models

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code structure and patterns
- Add comprehensive error handling
- Include logging for debugging
- Test with multiple AI models
- Maintain backward compatibility

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

### Common Issues

**API Key Errors**
- Ensure API keys are correctly set in `.env` or application settings
- Verify API key permissions and quotas

**Model Not Responding**
- Check internet connection
- Verify API key validity
- Check model availability status

**File Upload Issues**
- Ensure file types are supported (PDF, DOCX, XLSX, CSV, RTF, TXT)
- Check file size limitations
- Verify file permissions

### Getting Help
- Check the application logs in the developer console
- Review configuration in `config.json`
- Ensure all dependencies are properly installed

## 🚧 Roadmap

- [ ] Voice input/output integration
- [ ] Plugin system for third-party tools
- [ ] Cloud synchronization options
- [ ] Advanced analytics and insights
- [ ] Mobile companion app
- [ ] Collaborative features
- [ ] Advanced productivity tools

---

**Built with ❤️ using Electron, Node.js, and modern web technologies.** 