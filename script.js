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
    updateQuestionDisplay();
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
    if (!currentExam || !examData[currentExam].length) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    const question = examData[currentExam][currentQuestionIndex];
    
    // Create array of option objects with original indices
    const optionsWithIndices = question.options.map((option, index) => ({
        text: option,
        originalIndex: index
    }));

    // Shuffle the options
    currentQuestionOrder = shuffleArray([...optionsWithIndices]);
    
    document.getElementById('questionDisplay').innerHTML = `
        <h3>Question ${currentQuestionIndex + 1} of ${examData[currentExam].length}</h3>
        <p>${question.question}</p>
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

function selectAnswer(index) {
    selectedAnswer = index;
    document.querySelectorAll('.option').forEach(option => {
        option.classList.toggle('selected', 
            parseInt(option.dataset.index) === index);
    });
}

function checkAnswer() {
    if (selectedAnswer === null) return;

    const question = examData[currentExam][currentQuestionIndex];
    const options = document.querySelectorAll('.option');
    
    options.forEach((option) => {
        const displayIndex = parseInt(option.dataset.index);
        const originalIndex = parseInt(option.dataset.originalIndex);
        const isSelected = displayIndex === selectedAnswer;
        const isCorrect = originalIndex === question.correctAnswer;
        
        option.classList.remove('selected');
        if (isSelected && isCorrect) {
            option.classList.add('correct');
        } else if (isSelected && !isCorrect) {
            option.classList.add('incorrect');
        } else if (!isSelected && isCorrect) {
            option.classList.add('correct');
        }
    });

    document.getElementById('checkButton').classList.add('hidden');
    document.getElementById('nextButton').classList.remove('hidden');
    
    if (question.explanation) {
        document.getElementById('explanationDisplay').innerHTML = 
            `<p><strong>Explanation:</strong> ${question.explanation}</p>`;
        document.getElementById('explanationDisplay').classList.remove('hidden');
    }
}

function nextQuestion() {
    currentQuestionIndex = (currentQuestionIndex + 1) % examData[currentExam].length;
    updateQuestionDisplay();
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

// Initialize the app when loaded
document.addEventListener('DOMContentLoaded', initializeApp);