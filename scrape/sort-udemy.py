import re
import json

def parse_practice_questions(text):
    # Split into individual questions using "Question" as delimiter
    questions_raw = text.split('Question ')[1:]  # Skip empty first split
    parsed_questions = []
    
    for q_text in questions_raw:
        question_dict = {}
        
        # Split into lines and remove empty lines
        lines = [line.strip() for line in q_text.split('\n') if line.strip()]
        
        # First line contains question number and correct/incorrect - we can skip it
        current_line = 1  # Start from second line
        
        # Question context and question text are the next lines until we hit the first possible answer
        question_text = []
        while current_line < len(lines):
            if 'your answer is' in lines[current_line].lower() or 'correct answer' in lines[current_line].lower():
                break
            if current_line > 2 and lines[current_line - 1].endswith('?'):  # If we've hit an answer after a question mark
                break
            question_text.append(lines[current_line])
            current_line += 1
            
        # Remove the last line if it's actually an answer option
        if question_text and any(question_text[-1] in line for line in lines[current_line:] if 'correct' in line.lower()):
            question_text.pop()
            
        question_dict['question'] = ' '.join(question_text)
        
        # Collect options and identify correct answer
        options = []
        correct_answer = None
        while current_line < len(lines) and not lines[current_line].startswith('Overall explanation'):
            line = lines[current_line]
            
            # If this is a marker line, check if it indicates the next line is correct
            if 'correct answer' in line.lower():
                if current_line + 1 < len(lines):
                    correct_answer = len(options)  # The next option will be correct
            elif not any(marker in line.lower() for marker in 
                      ['your answer is', 'correct option:', 'reference:', 'domain']):
                # Only add if it looks like an actual option (not too long)
                if len(line) < 200:
                    options.append(line)
            
            current_line += 1
        
        # If we didn't find the correct answer through "correct answer" marker,
        # look for the option that appears after "Correct option:"
        if correct_answer is None:
            correct_option_index = next((i for i, line in enumerate(lines) if line.startswith('Correct option:')), -1)
            if correct_option_index != -1 and correct_option_index + 1 < len(lines):
                correct_option = lines[correct_option_index + 1].strip()
                correct_answer = next((i for i, opt in enumerate(options) if opt == correct_option), 0)
        
        question_dict['options'] = options[:4]  # Take first 4 options
        question_dict['correctAnswer'] = correct_answer if correct_answer is not None else 0
        
        # Find domain
        domain_index = next((i for i, line in enumerate(lines) if line.startswith('Domain')), -1)
        if domain_index != -1 and domain_index + 1 < len(lines):
            question_dict['explanation'] = lines[domain_index + 1]
        else:
            question_dict['explanation'] = ""
        
        parsed_questions.append(question_dict)
    
    return parsed_questions

def save_to_json(questions, output_file='sorted_udemy.json'):
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(questions, f, indent=2, ensure_ascii=False)

# Example usage
if __name__ == "__main__":
    # Read the input file
    with open('input.txt', 'r', encoding='utf-8') as f:
        text = f.read()
    
    # Parse questions
    parsed_questions = parse_practice_questions(text)
    
    # Save to JSON file
    save_to_json(parsed_questions)
    
    # Print first question as example
    print(json.dumps(parsed_questions[0], indent=2))