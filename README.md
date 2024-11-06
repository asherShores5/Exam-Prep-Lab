# Study-Buddy

A lightweight, browser-based application for creating and practicing certification exam questions. This tool allows users to create custom question banks for various certification exams, practice with them, and import/export exam data.

### Features

- 📝 Create and manage multiple certification exam question banks
- ❓ Add custom questions with multiple-choice answers
- 📋 Include detailed explanations for each answer
- 💾 Import and export exam data in JSON format
- ✨ Clean, intuitive user interface
- 📱 Responsive design for desktop and mobile devices

## Getting Started

### Prerequisites

No special installation is required. You just need:

- A modern web browser (Chrome, Firefox, Safari, or Edge)
- A local web server (optional, for development)

### Installation

1. Clone or download this repository to your local machine
2. Open index.html in your web browser
3. For development, you may want to use a local web server to avoid CORS issues

## Usage

1. **Select or Create an Exam**

   - Choose an existing exam from the dropdown menu
   - Or click "Add New Exam" to create a new question bank

2. **Add Questions**

   - Click "Add Question" to open the question form
   - Enter the question text
   - Add four possible answers (A, B, C, D)
   - Select the correct answer
   - Optionally add an explanation
   - Click "Save Question" to add it to the exam

3. Import/Export

   - Use "Export Current Exam" to save your question bank as JSON
   - Use "Import Exam" to load previously exported question banks



File Structure

```bash
certification-quiz-tool/
├── index.html
├── styles.css
└── script.js
```

## Contributing

Feel free to fork this repository and submit pull requests. Some areas for potential improvement:

- Add support for multiple correct answers
- Implement question categories/tags
- Add a study mode with flashcards
- Include a progress tracking system

## License
This project is open source and available under the Apache 2.0 License.