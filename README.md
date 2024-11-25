# Exam Prep Lab

A modern React application for exam preparation, featuring interactive study modes, progress tracking, and performance analytics.

## Features

- **Multiple Study Modes**
  - Review Mode: Study questions with detailed explanations
  - Quiz Mode: Timed assessments with configurable settings
  - Flashcard Mode: Quick memorization and recall practice

- **Advanced Quiz Features**
  - Configurable question count (10-50 questions)
  - Adjustable time limits (15-90 minutes)
  - Support for multiple correct answers
  - Real-time progress tracking
  - Automatic scoring

- **Performance Analytics**
  - Progress tracking across attempts
  - Score trends visualization
  - Average performance metrics
  - Time spent analysis
  - Best score tracking

- **User Experience**
  - Modern, responsive interface
  - Dark mode design
  - Question shuffling
  - Persistent progress saving
  - Cross-device compatibility

## Technical Stack

- React
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Recharts for data visualization
- Local Storage for data persistence

## Project Structure

```
src/
├── components/
│   └── ui/           # shadcn/ui components
├── types/
│   └── index.ts      # TypeScript interfaces
├── public/
│   └── exams/        # Exam JSON files
└── QuizApp.tsx       # Main application component
```

## Data Structure

Exams are stored as JSON files with the following structure:

```typescript
interface Question {
  question: string;
  options: string[];
  correctAnswers: number[];
  explanation: string;
}

interface ExamIndex {
  id: string;
  name: string;
  path: string;
}
```

## Getting Started

1. **Installation**
   ```bash
   npm install
   ```

2. **Add Exam Data**
   - Create exam JSON files in `public/exams/`
   - Update `index.json` with exam metadata

3. **Development**
   ```bash
   npm run dev
   ```

## Contributing

Contributions welcome! Some areas for enhancement:
- Question categorization/tagging
- Study schedules and reminders
- Expanded analytics features
- Additional study modes

## License

Apache 2.0