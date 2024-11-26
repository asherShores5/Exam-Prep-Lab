# Exam Prep Lab

A modern React application for exam preparation, featuring interactive study modes, progress tracking, and performance analytics. Deployed on AWS Amplify at [exampreplab.com](https://www.exampreplab.com)

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
- AWS Amplify for hosting and CI/CD
- AWS Route 53 for domain management

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

## AWS Deployment Setup

### Domain Registration (Route 53)
1. Register domain in AWS Route 53:
   ```bash
   aws route53domains register-domain --domain-name exampreplab.com --duration-in-years 1
   ```

2. Create hosted zone:
   ```bash
   aws route53 create-hosted-zone --name exampreplab.com --caller-reference $(date +%s)
   ```

3. Note the nameservers assigned to your hosted zone for domain configuration.

### AWS Amplify Setup
1. Install Amplify CLI:
   ```bash
   npm install -g @aws-amplify/cli
   amplify configure
   ```

2. Initialize Amplify in project:
   ```bash
   amplify init
   ```

3. Add hosting:
   ```bash
   amplify add hosting
   ```

4. Configure build settings in `amplify.yml`:
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - npm ci
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: dist
       files:
         - '**/*'
     cache:
       paths:
         - node_modules/**/*
   ```

5. Enable automatic deployments:
   - Connect repository in Amplify Console
   - Configure branch settings
   - Set up build specifications

### Domain Configuration
1. Add domain in Amplify Console:
   - Go to Domain Management
   - Add domain: exampreplab.com
   - Verify domain ownership
   - Wait for SSL certificate provisioning

2. Update DNS settings:
   - Amplify will automatically create required records in Route 53
   - Verify DNS propagation (may take up to 48 hours)

## Development Workflow

1. **Installation**
   ```bash
   npm install
   ```

2. **Add Exam Data**
   - Create exam JSON files in `public/exams/`
   - Update `index.json` with exam metadata

3. **Local Development**
   ```bash
   npm run dev
   ```

4. **Deployment**
   ```bash
   # Deploy to production
   git push origin main
   
   # Preview changes (creates preview URL)
   git push origin feature/branch
   ```

## CI/CD Pipeline
- **Automated builds** trigger on push to main branch
- **Preview environments** created for feature branches
- **Production deployments** require manual approval
- **Build cache** enabled for faster deployments
- **Environment variables** managed in Amplify Console

## Monitoring and Maintenance
- View deployment status in Amplify Console
- Monitor application metrics
- Access build logs and history
- Manage environment variables
- Configure access controls

## Contributing
Contributions welcome! Some areas for enhancement:
- Question categorization/tagging
- Study schedules and reminders
- Expanded analytics features
- Additional study modes
- Performance optimizations
- Automated testing improvements

## License
Apache 2.0