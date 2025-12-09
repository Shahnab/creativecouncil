# Creative Council 🎨🤖

**AI-Powered Brand Strategy & Creative Critique System**

Creative Council is a sophisticated React application that leverages Google's Gemini 3 Pro (Preview) model to simulate a panel of expert brand strategists and consumer personas. It autonomously researches a brand, generates relevant market personas, and provides deep, multi-perspective critiques of creative assets (images and videos).

## 🚀 Features

*   **🕵️ Deep Brand Research**: Automatically analyzes a target URL to extract brand voice, tone, target audience, competitors, and unique selling propositions.
*   **👥 Dynamic Persona Generation**: Creates realistic, market-specific consumer personas tailored to the brand's profile.
*   **⚖️ AI Creative Judgment**: Simulates a "council" where each persona reviews uploaded creative assets, providing scores, quotes, pros/cons, and emotional reactions.
*   **📊 Comprehensive Reporting**: Synthesizes all judgments into a strategic executive summary and exports a beautifully formatted PDF report.
*   **🎥 Video & Image Analysis**: Supports both static images and video assets for critique.
*   **🌍 Global Market Context**: Tailors the analysis for specific international markets (Vietnam, US, UK, Japan, etc.).

## 🛠️ Tech Stack

*   **Frontend**: React 19, TypeScript, Vite
*   **AI Model**: Google Gemini 3 Pro (Preview) (via `@google/genai` SDK)
*   **Styling**: CSS Modules with a "Glassmorphism" / Obsidian theme
*   **PDF Generation**: `html2pdf.js`
*   **Markdown Rendering**: `react-markdown`

## 🏁 Getting Started

### Prerequisites

*   Node.js (v18 or higher)
*   A Google Gemini API Key (Get one [here](https://aistudio.google.com/app/apikey))

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/Shahnab/creativecouncil.git
    cd creativecouncil
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```

4.  Open your browser at `http://localhost:3000` (or the port shown in the terminal).

## 💡 Usage

1.  **Configure API Key**: Click the **Gear Icon** ⚙️ in the top right corner and enter your Gemini API Key. It will be saved locally in your browser.
2.  **Enter Brand Details**:
    *   **Brand URL**: The website of the brand you want to analyze.
    *   **Target Market**: Select the country for the market context.
3.  **Upload Assets**: Drag and drop or select images/videos you want the council to critique.
4.  **Start Analysis**: Click "Initialize Council" to begin the AI workflow.
    *   *Phase 1*: Researching the brand.
    *   *Phase 2*: Recruiting (generating) personas.
    *   *Phase 3*: Judging the assets.
    *   *Phase 4*: Synthesizing the final report.
5.  **Download Report**: Once complete, click "Download PDF Report" to get a professional dossier of the findings.

## 📄 License

This project is licensed under the MIT License.

---

*Built with ❤️ and 🤖 by [Shahnab](https://github.com/Shahnab)*
