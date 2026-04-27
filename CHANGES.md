# Exam Prep Lab - Recent Changes

## Summary

Major refactor of the flashcards and management features to align with the exam bank workflow and improve progress tracking.

## Changes Made

### 1. **Manage Tab → Data Tab**
- **Removed**: User-managed question creation/editing (QuestionForm, QuestionList)
- **Kept**: Import/Export functionality only
- **Rationale**: Questions come from static JSON exam files, not user creation

### 2. **Flashcards Tab - Complete Redesign**
- **New Workflow**: Create decks, then populate from exam bank via fuzzy search
- **Features**:
  - **My Decks** sub-tab: Create/rename/delete decks, start review sessions
  - **Add from Exam Bank** sub-tab: Fuzzy search through exam questions, add to existing or new decks
  - **"Save to Deck" button** during flashcard review (when decks exist)
  - **Mastery tracking**: Cards track `masteryLevel` (0 = still learning, 1+ = known)
  - **Persistence**: Mastery increments on "Known", resets to 0 on "Still Learning"
- **Removed**: Manual flashcard creation/editing (FlashcardForm)

### 3. **Flashcard Viewer Enhancements**
- **Multiple Choice Mode**: New study mode alongside classic flashcards
  - Shows shuffled answer options
  - Immediate feedback (green = correct, red = incorrect)
  - Displays explanation after answering
  - Auto-advances after selection
- **Classic Mode Improvements**:
  - Now shows explanation below the answer when revealed
  - "Save to Deck" panel for adding current card to a deck
- **Mode Toggle**: Switch between Classic and Multiple Choice modes
- **Mastery Tracking**: Updates flashcard mastery level on each review

### 4. **Progress Dashboard Improvements**
- **Domain Accuracy**: Now shows aggregated domain performance across all quiz attempts
  - Visual progress bars (green/yellow/red based on percentage)
  - Aggregates data from all quiz results with domain breakdowns
- **Review Session History**: Fixed to include legacy flashcard sessions
  - Sessions with `deckId: 'legacy'` now display as "All Exam Questions"
  - Shows all review sessions for the selected exam

### 5. **Quiz Mode Enhancement**
- **Domain Persistence**: Quiz results now store per-domain breakdown
  - Added `QuizResultDomain` type with `domain`, `correct`, `total`
  - `QuizResult.domains` array persists domain data for each attempt
  - Enables historical domain accuracy tracking in Progress tab

### 6. **Page Load UX**
- **Clear Initial State**: Added label and empty-state prompt when no exam is selected
  - "Select an exam to get started" label above dropdown
  - Icon + message: "Choose an exam from the dropdown above to start studying"
- **Loading States**: Improved "Loading questions…" styling (centered, gray text)

### 7. **Type System Updates**
- **Flashcard**: Added `masteryLevel: number` and `lastReviewedAt?: string`
- **QuizResult**: Added `domains?: QuizResultDomain[]` for per-domain tracking
- **QuizResultDomain**: New type for domain breakdown (`domain`, `correct`, `total`)

## Data Migration Notes

### Flashcard Mastery
- **Existing flashcards**: Will have `masteryLevel: undefined` until first reviewed
- **New flashcards**: Initialize with `masteryLevel: 0`
- **Backward compatible**: App handles missing `masteryLevel` gracefully

### Quiz Domain Data
- **Existing quiz results**: Will have `domains: undefined`
- **New quiz results**: Include `domains` array when domain data is available
- **Backward compatible**: Progress dashboard handles missing domain data

## Files Modified

### Core App
- `src/App.tsx` - Complete rewrite of FlashcardsTab, removed Manage tab logic
- `src/types/index.ts` - Added `QuizResultDomain`, updated `Flashcard` and `QuizResult`

### Components
- `src/components/flashcard/FlashcardViewer.tsx` - Added multiple choice mode, save-to-deck, mastery tracking
- `src/components/progress/ProgressDashboard.tsx` - Domain accuracy rendering, legacy session support

### Removed Imports
- `FlashcardForm` - No longer used
- `QuestionForm` - No longer used
- `QuestionList` - No longer used
- `DeckList` - No longer used (inline deck management now)
- `DeckForm` - No longer used (inline deck creation now)

## User-Facing Changes

### What Users Will Notice
1. **Simpler Manage Tab**: Now just "Data" with import/export only
2. **Better Flashcard Workflow**: Search exam bank → add to decks → review with mastery tracking
3. **Multiple Choice Practice**: New study mode for exam-style practice
4. **Domain Insights**: See which exam domains need more study
5. **Clearer Onboarding**: Better guidance when first opening the app
6. **Progress Retention**: Flashcard mastery persists across sessions

### What Users Won't Notice
- All existing data remains intact
- Gradual enhancement as new data is created
- No breaking changes to existing functionality
