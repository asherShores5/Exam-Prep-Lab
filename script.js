// Global state
let examData = {};
let currentExam = '';
let currentQuestionIndex = 0;
let selectedAnswer = null;

// Load existing exams from localStorage on startup
function initializeApp() {
    const savedExams = localStorage.getItem('examList');
    if (savedExams) {
        const examList = JSON.parse(savedExams);
        examList.forEach(examName => {
            const examContent = localStorage.getItem(`exam_${examName}`);
            if (examContent) {
                examData[examName] = JSON.parse(examContent);
            }
        });
    }
    updateExamSelect();
    updateProgressDisplay();
}

// Save an individual exam
function saveExam(examName) {
    // Save exam content
    localStorage.setItem(`exam_${examName}`, JSON.stringify(examData[examName]));
    
    // Update exam list
    const examList = Object.keys(examData);
    localStorage.setItem('examList', JSON.stringify(examList));

}

// Export specific exam to file
function exportExamToFile(examName) {
    const examContent = examData[examName];
    const dataStr = "data:text/json;charset=utf-8," + 
        encodeURIComponent(JSON.stringify(examContent));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${examName}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function showNewExam() {
    document.getElementById('newExamForm').classList.remove('hidden');
}

function hideNewExam() {
    document.getElementById('newExamForm').classList.add('hidden');
    document.getElementById('newExamName').value = '';
}

function addNewExam() {
    const examName = document.getElementById('newExamName').value.trim();
    if (examName) {
        examData[examName] = [];
        saveExam(examName);
        updateExamSelect();
        hideNewExam();
        currentExam = examName;
        document.getElementById('examSelect').value = examName;
        updateQuestionDisplay();
    }
}

function updateExamSelect() {
    const select = document.getElementById('examSelect');
    select.innerHTML = '<option value="">Select an exam...</option>';
    Object.keys(examData).forEach(exam => {
        const option = document.createElement('option');
        option.value = exam;
        option.textContent = exam;
        select.appendChild(option);
    });
}

function changeExam() {
    currentExam = document.getElementById('examSelect').value;
    currentQuestionIndex = 0;
    selectedAnswer = null;
    quizSessionData = { currentQuiz: null };
    updateQuestionDisplay();
    updateProgressDisplay();
    
    // Show/hide quiz setup based on exam selection
    if (currentExam) {
        document.getElementById('quizSetup').classList.remove('hidden');
    } else {
        document.getElementById('quizSetup').classList.add('hidden');
    }
}

function showAddQuestion() {
    if (!currentExam) {
        alert('Please select or create an exam first');
        return;
    }
    document.getElementById('addQuestionForm').classList.remove('hidden');
}

function hideAddQuestion() {
    document.getElementById('addQuestionForm').classList.add('hidden');
    resetAddForm();
}

function resetAddForm() {
    document.getElementById('questionText').value = '';
    document.getElementById('optionA').value = '';
    document.getElementById('optionB').value = '';
    document.getElementById('optionC').value = '';
    document.getElementById('optionD').value = '';
    document.getElementById('explanationText').value = '';
    document.querySelectorAll('input[name="correctAnswer"]').forEach(radio => radio.checked = false);
}

function saveQuestion() {
    const questionText = document.getElementById('questionText').value;
    const options = [
        document.getElementById('optionA').value,
        document.getElementById('optionB').value,
        document.getElementById('optionC').value,
        document.getElementById('optionD').value
    ];
    const correctAnswer = document.querySelector('input[name="correctAnswer"]:checked');
    const explanation = document.getElementById('explanationText').value;

    if (questionText && options.every(opt => opt.trim()) && correctAnswer) {
        examData[currentExam].push({
            question: questionText,
            options: options,
            correctAnswer: parseInt(correctAnswer.value),
            explanation: explanation
        });
        saveExam(currentExam);
        hideAddQuestion();
        updateQuestionDisplay();
    } else {
        alert('Please fill in all fields and select the correct answer');
    }
}

let currentQuestionOrder = [];

// Helper function to shuffle array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function updateQuestionDisplay() {
    const container = document.getElementById('quizContainer');
    container.classList.remove('hidden');
    
    let question, options;
    
    if (quizSessionData.currentQuiz) {
        // Practice quiz mode
        question = quizSessionData.questions[quizSessionData.currentIndex];
        document.getElementById('questionCounter').textContent = 
            `Question ${quizSessionData.currentIndex + 1} of ${quizSessionData.questions.length}`;
    } else {
        // Regular review mode
        if (!currentExam || !examData[currentExam].length) {
            container.classList.add('hidden');
            return;
        }
        question = examData[currentExam][currentQuestionIndex];
        document.getElementById('questionCounter').textContent = 
            `Question ${currentQuestionIndex + 1} of ${examData[currentExam].length}`;
    }
    
    // Create array of option objects with original indices
    const optionsWithIndices = question.options.map((option, index) => ({
        text: option,
        originalIndex: index
    }));

    // Shuffle the options
    currentQuestionOrder = shuffleArray([...optionsWithIndices]);
    
    document.getElementById('questionDisplay').innerHTML = `
        <h3>${question.question}</h3>
    `;

    const optionsHtml = currentQuestionOrder.map((option, index) => `
        <div class="option" onclick="selectAnswer(${index})" data-index="${index}" data-original-index="${option.originalIndex}">
            ${['A', 'B', 'C', 'D'][index]}. ${option.text}
        </div>
    `).join('');
    
    document.getElementById('optionsDisplay').innerHTML = optionsHtml;
    document.getElementById('checkButton').classList.remove('hidden');
    document.getElementById('nextButton').classList.add('hidden');
    document.getElementById('explanationDisplay').classList.add('hidden');
    selectedAnswer = null;
}

function showQuizResults(result) {
    document.getElementById('quizContainer').classList.add('hidden');
    document.getElementById('quizResults').classList.remove('hidden');
    
    const correct = result.answers.filter(a => a.isCorrect).length;
    const total = result.answers.length;
    const score = (correct / total * 100).toFixed(1);
    
    document.getElementById('resultsSummary').innerHTML = `
        <h4>Quiz Complete!</h4>
        <p>Score: ${score}%</p>
        <p>Correct Answers: ${correct}/${total}</p>
        <p>Time: ${formatTime(result.timeEnded - result.timeStarted)}</p>
    `;
    
    updateProgressDisplay();
}

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function returnToMain() {
    document.getElementById('quizResults').classList.add('hidden');
    document.getElementById('quizSetup').classList.remove('hidden');
    document.getElementById('progressDashboard').classList.remove('hidden');
    quizSessionData = { currentQuiz: null };
}

function selectAnswer(index) {
    selectedAnswer = index;
    document.querySelectorAll('.option').forEach(option => {
        option.classList.toggle('selected', 
            parseInt(option.dataset.index) === index);
    });
}

function submitQuizAnswer(answerData) {
    if (!quizSessionData.currentQuiz) return null;

    quizSessionData.answers.push(answerData);

    if (quizSessionData.currentIndex < quizSessionData.questions.length - 1) {
        quizSessionData.currentIndex++;
        return { completed: false, nextQuestion: quizSessionData.currentIndex };
    } else {
        quizSessionData.timeEnded = Date.now();
        const results = {
            examName: quizSessionData.currentQuiz,
            questions: quizSessionData.questions,
            answers: quizSessionData.answers,
            timeStarted: quizSessionData.timeStarted,
            timeEnded: quizSessionData.timeEnded
        };
        
        const progress = progressTracker.updateProgress(results);
        
        return {
            completed: true,
            results,
            progress
        };
    }
}

function checkAnswer() {
    if (selectedAnswer === null) return;

    if (quizSessionData.currentQuiz) {
        // Practice quiz mode
        const selectedOriginalIndex = currentQuestionOrder[selectedAnswer].originalIndex;
        const question = quizSessionData.questions[quizSessionData.currentIndex];
        const isCorrect = selectedOriginalIndex === question.correctAnswer;
        
        // Show feedback immediately
        showAnswerFeedback(isCorrect, question);
        
        // Submit answer and handle result
        const result = submitQuizAnswer({
            selectedAnswer: selectedOriginalIndex,
            isCorrect: isCorrect
        });

        if (result.completed) {
            clearInterval(quizTimer);
            showQuizResults(result.results);  // Pass the results object
        } else {
            document.getElementById('checkButton').classList.add('hidden');
            document.getElementById('nextButton').classList.remove('hidden');
        }
    } else {
        // Regular review mode
        const question = examData[currentExam][currentQuestionIndex];
        const selectedOriginalIndex = currentQuestionOrder[selectedAnswer].originalIndex;
        const isCorrect = selectedOriginalIndex === question.correctAnswer;
        
        showAnswerFeedback(isCorrect, question);
        document.getElementById('checkButton').classList.add('hidden');
        document.getElementById('nextButton').classList.remove('hidden');
    }
}

// Helper function to show answer feedback
function showAnswerFeedback(isCorrect, question) {
    const options = document.querySelectorAll('.option');
    
    options.forEach((option) => {
        const displayIndex = parseInt(option.dataset.index);
        const originalIndex = parseInt(option.dataset.originalIndex);
        const isSelected = displayIndex === selectedAnswer;
        
        option.classList.remove('selected');
        if (isSelected && isCorrect) {
            option.classList.add('correct');
        } else if (isSelected && !isCorrect) {
            option.classList.add('incorrect');
        } else if (!isSelected && originalIndex === question.correctAnswer) {
            option.classList.add('correct');
        }
    });

    if (question.explanation) {
        document.getElementById('explanationDisplay').innerHTML = `
            <p><strong>Explanation:</strong> ${question.explanation}</p>
        `;
        document.getElementById('explanationDisplay').classList.remove('hidden');
    }
}

function reviewQuiz() {
    const results = quizSessionData;
    document.getElementById('quizResults').classList.add('hidden');
    document.getElementById('quizContainer').classList.remove('hidden');
    
    let reviewHtml = '<div class="review-container">';
    results.questions.forEach((question, index) => {
        const answer = results.answers[index];
        const isCorrect = answer.isCorrect;
        
        reviewHtml += `
            <div class="result-item ${isCorrect ? 'correct' : 'incorrect'}">
                <h4>Question ${index + 1}</h4>
                <p>${question.question}</p>
                <div class="options-review">
                    ${question.options.map((option, optIndex) => `
                        <div class="option-review ${
                            optIndex === answer.selectedAnswer ? 'selected' : ''
                        } ${
                            optIndex === question.correctAnswer ? 'correct' : ''
                        }">
                            ${['A', 'B', 'C', 'D'][optIndex]}. ${option}
                        </div>
                    `).join('')}
                </div>
                ${question.explanation ? `
                    <div class="explanation">
                        <strong>Explanation:</strong> ${question.explanation}
                    </div>
                ` : ''}
            </div>
        `;
    });
    reviewHtml += '</div>';
    
    document.getElementById('questionDisplay').innerHTML = reviewHtml;
    document.getElementById('optionsDisplay').innerHTML = '';
    document.getElementById('checkButton').classList.add('hidden');
    document.getElementById('nextButton').classList.add('hidden');
    
    // Add a return button
    const returnButton = document.createElement('button');
    returnButton.textContent = 'Return to Results';
    returnButton.onclick = () => {
        document.getElementById('quizContainer').classList.add('hidden');
        document.getElementById('quizResults').classList.remove('hidden');
    };
    document.getElementById('quizContainer').appendChild(returnButton);
}

function nextQuestion() {
    if (quizSessionData.currentQuiz) {
        // Practice quiz mode
        currentQuestionIndex = quizSessionData.currentIndex;
        updateQuestionDisplay();
    } else {
        // Regular review mode
        currentQuestionIndex = (currentQuestionIndex + 1) % examData[currentExam].length;
        updateQuestionDisplay();
    }
}

function exportCurrentExam() {
    if (!currentExam) {
        alert('Please select an exam first');
        return;
    }
    exportExamToFile(currentExam);
}

function importExam() {
    const file = document.getElementById('importFile').files[0];
    const examName = file.name.replace('.json', '');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const questions = JSON.parse(e.target.result);
            examData[examName] = questions;
            saveExam(examName);
            updateExamSelect();
            currentExam = examName;
            document.getElementById('examSelect').value = examName;
            currentQuestionIndex = 0;
            updateQuestionDisplay();
        } catch (error) {
            alert('Error importing exam. Please make sure the file is valid JSON.');
        }
    };
    
    reader.readAsText(file);
}

const progressTracker = {
    // Initialize progress tracking
    initializeProgress() {
        const savedProgress = localStorage.getItem('quizProgress');
        return savedProgress ? JSON.parse(savedProgress) : {
            examStats: {},  // Stats per exam
            questionStats: {},  // Stats per question
            recentQuizzes: []  // Store recent quiz results
        };
    },

    // Update progress after quiz completion
    updateProgress(quizResults) {
        const progress = this.initializeProgress();
        const { examName, questions, answers, timeStarted, timeEnded } = quizResults;
        
        // Update exam-level statistics
        if (!progress.examStats[examName]) {
            progress.examStats[examName] = {
                totalAttempts: 0,
                correctAnswers: 0,
                totalQuestions: 0,
                averageScore: 0,
                bestScore: 0,
                averageTimePerQuestion: 0
            };
        }

        const examStats = progress.examStats[examName];
        const correctCount = answers.filter(a => a.isCorrect).length;
        const totalTime = timeEnded - timeStarted;
        
        examStats.totalAttempts++;
        examStats.totalQuestions += questions.length;
        examStats.correctAnswers += correctCount;
        examStats.averageScore = (examStats.correctAnswers / examStats.totalQuestions) * 100;
        examStats.bestScore = Math.max(examStats.bestScore, (correctCount / questions.length) * 100);
        examStats.averageTimePerQuestion = totalTime / questions.length;

        // Update question-level statistics
        questions.forEach((q, idx) => {
            const questionId = `${examName}_${q.question.substring(0, 30)}`;
            if (!progress.questionStats[questionId]) {
                progress.questionStats[questionId] = {
                    attempts: 0,
                    correctAttempts: 0,
                    lastAttempted: null,
                    difficulty: 0
                };
            }

            const qStats = progress.questionStats[questionId];
            qStats.attempts++;
            if (answers[idx].isCorrect) qStats.correctAttempts++;
            qStats.lastAttempted = Date.now();
            qStats.difficulty = 1 - (qStats.correctAttempts / qStats.attempts);
        });

        // Store recent quiz results
        progress.recentQuizzes.unshift({
            examName,
            date: Date.now(),
            score: (correctCount / questions.length) * 100,
            timeSpent: totalTime,
            questionCount: questions.length
        });
        progress.recentQuizzes = progress.recentQuizzes.slice(0, 10);

        localStorage.setItem('quizProgress', JSON.stringify(progress));
        return progress;
    }
};

// Quiz Session Management
let quizSessionData = {
    currentQuiz: null,
    questions: [],
    answers: [],
    timeStarted: null,
    timeEnded: null,
    currentIndex: 0
};

function updateProgressDisplay() {
    const progress = progressTracker.initializeProgress();
    const currentExamName = currentExam;
    
    if (!currentExamName) {
        document.getElementById('progressDashboard').classList.add('hidden');
        return;
    }
    
    document.getElementById('progressDashboard').classList.remove('hidden');
    
    // Update overall stats
    const examStats = progress.examStats[currentExamName] || {
        totalAttempts: 0,
        averageScore: 0,
        bestScore: 0
    };
    
    document.getElementById('overallStats').innerHTML = `
        <p>Total Attempts: ${examStats.totalAttempts}</p>
        <p>Average Score: ${examStats.averageScore.toFixed(1)}%</p>
        <p>Best Score: ${examStats.bestScore.toFixed(1)}%</p>
        <div class="progress-bar">
            <div class="progress-bar-fill" style="width: ${examStats.averageScore}%"></div>
        </div>
    `;
    
    // Update recent quizzes
    const recentQuizzes = progress.recentQuizzes
        .filter(quiz => quiz.examName === currentExamName)
        .slice(0, 5);
    
    document.getElementById('recentQuizzes').innerHTML = recentQuizzes.length
        ? recentQuizzes.map(quiz => `
            <div class="recent-quiz">
                <div>Score: ${quiz.score.toFixed(1)}%</div>
                <div>Questions: ${quiz.questionCount}</div>
                <div>Date: ${new Date(quiz.date).toLocaleDateString()}</div>
            </div>
        `).join('')
        : '<p>No recent quizzes</p>';
}

function startPracticeQuiz() {
    if (!currentExam) {
        alert('Please select an exam first');
        return;
    }
    
    const questionCount = parseInt(document.getElementById('questionCount').value);
    if (isNaN(questionCount) || questionCount < 5 || questionCount > 50) {
        alert('Please enter a valid number of questions (5-50)');
        return;
    }
    
    const quizSession = startNewQuiz(currentExam, questionCount);
    if (!quizSession) {
        alert('Failed to start quiz. Please make sure the exam has questions.');
        return;
    }
    
    // Update UI for quiz mode
    document.getElementById('quizSetup').classList.add('hidden');
    document.getElementById('progressDashboard').classList.add('hidden');
    updateQuizDisplay();
    startQuizTimer();
}

// Unified question display function
function updateQuizDisplay() {
    const container = document.getElementById('quizContainer');
    container.classList.remove('hidden');
    
    let question, totalQuestions;
    
    if (quizSessionData.currentQuiz) {
        // Practice quiz mode
        question = quizSessionData.questions[quizSessionData.currentIndex];
        totalQuestions = quizSessionData.questions.length;
        
        document.getElementById('questionCounter').textContent = 
            `Question ${quizSessionData.currentIndex + 1} of ${totalQuestions}`;
    } else {
        // Regular review mode
        if (!currentExam || !examData[currentExam].length) {
            container.classList.add('hidden');
            return;
        }
        question = examData[currentExam][currentQuestionIndex];
        totalQuestions = examData[currentExam].length;
        
        document.getElementById('questionCounter').textContent = 
            `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
    }
    
    // Create array of option objects with original indices
    const optionsWithIndices = question.options.map((option, index) => ({
        text: option,
        originalIndex: index
    }));

    // Shuffle the options
    currentQuestionOrder = shuffleArray([...optionsWithIndices]);
    
    document.getElementById('questionDisplay').innerHTML = `
        <h3>${question.question}</h3>
    `;

    const optionsHtml = currentQuestionOrder.map((option, index) => `
        <div class="option" onclick="selectAnswer(${index})" data-index="${index}" data-original-index="${option.originalIndex}">
            ${['A', 'B', 'C', 'D'][index]}. ${option.text}
        </div>
    `).join('');
    
    document.getElementById('optionsDisplay').innerHTML = optionsHtml;
    document.getElementById('checkButton').classList.remove('hidden');
    document.getElementById('nextButton').classList.add('hidden');
    document.getElementById('explanationDisplay').classList.add('hidden');
    selectedAnswer = null;
}

let quizTimer = null;

function startNewQuiz(examName, questionCount) {
    const exam = examData[examName];
    if (!exam || exam.length === 0) return null;

    // Get progress data for weighted selection
    const progress = progressTracker.initializeProgress();
    
    // Weight questions based on performance and time
    const weightedQuestions = exam.map((q, idx) => {
        const questionId = `${examName}_${q.question.substring(0, 30)}`;
        const stats = progress.questionStats[questionId] || {
            difficulty: 0.5,
            lastAttempted: 0
        };

        const daysSinceLastAttempt = (Date.now() - (stats.lastAttempted || 0)) / (1000 * 60 * 60 * 24);
        const timeWeight = Math.min(daysSinceLastAttempt / 7, 1);

        const weight = (
            (stats.difficulty * 0.4) +
            (timeWeight * 0.4) +
            (Math.random() * 0.2)
        );

        return { question: q, weight, index: idx };
    });

    // Sort by weight and select questions
    weightedQuestions.sort((a, b) => b.weight - a.weight);
    const selectedQuestions = weightedQuestions
        .slice(0, Math.min(questionCount, exam.length))
        .sort(() => Math.random() - 0.5);

    quizSessionData = {
        currentQuiz: examName,
        questions: selectedQuestions.map(q => q.question),
        answers: [],
        timeStarted: Date.now(),
        timeEnded: null,
        currentIndex: 0
    };

    return quizSessionData;
}

function startQuizTimer() {
    const startTime = Date.now();
    const timerDisplay = document.getElementById('quizTimer');
    
    quizTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Initialize the app when loaded
// Initialize the progress tracker when the app loads
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    updateProgressDisplay();
});