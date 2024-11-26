import re
import json
import os

def parse_practice_questions(text):
    questions_raw = text.split('Question ')[1:]
    parsed_questions = []
    
    for q_text in questions_raw:
        lines = q_text.split('\n')
        lines = [line.strip() for line in lines if line.strip()]
        
        if len(lines) < 4:
            continue
            
        question_dict = {
            "question": "",
            "options": [],
            "correctAnswers": [],
            "explanation": ""
        }
        
        # Get question text (second line)
        question_dict['question'] = lines[1]
        
        # Initialize variables
        current_line = 2
        options = []
        correct_answers = []
        
        # First pass: collect all options until Overall explanation
        while current_line < len(lines):
            line = lines[current_line]
            
            if line.startswith('Overall explanation'):
                break
                
            if line not in ['Correct answer', 'Correct selection'] and not line.startswith('Domain'):
                if 'Correct selection' not in line:  # Avoid adding "Correct selection" marker as an option
                    options.append(line)
                    # If this option is preceded by "Correct selection", it's a correct answer
                    if current_line > 0 and lines[current_line - 1] == 'Correct selection':
                        correct_answers.append(len(options) - 1)
                    # If this option follows "Correct answer", it's a correct answer
                    if current_line > 0 and lines[current_line - 1] == 'Correct answer':
                        correct_answers.append(len(options) - 1)
                        
            current_line += 1
        
        question_dict['options'] = options
        question_dict['correctAnswers'] = correct_answers if correct_answers else [0]
        
        # Get explanation
        explanation_start = next((i for i, line in enumerate(lines) 
                                if line.startswith('Overall explanation')), None)
        domain_start = next((i for i, line in enumerate(lines) 
                           if line == 'Domain'), None)
        
        if explanation_start is not None and domain_start is not None:
            explanation_lines = lines[explanation_start + 1:domain_start]
            explanation = ' '.join(explanation_lines)
            question_dict['explanation'] = explanation
        
        parsed_questions.append(question_dict)
    
    return parsed_questions

def save_to_json(questions, output_file='parsed_udemy_multiple_answers.json'):
    existing_questions = []
    if os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                existing_questions = json.load(f)
        except json.JSONDecodeError:
            print(f"Warning: Could not read existing JSON file {output_file}. Starting fresh.")
    
    all_questions = existing_questions + questions
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, indent=2, ensure_ascii=False)
    
    return len(existing_questions), len(all_questions)

if __name__ == "__main__":
    try:
        with open('input.txt', 'r', encoding='utf-8') as f:
            text = f.read()
        
        parsed_questions = parse_practice_questions(text)
        if not parsed_questions:
            print("No questions were successfully parsed.")
        else:
            initial_count, final_count = save_to_json(parsed_questions)
            print(f"\nParsing Statistics:")
            print(f"Questions parsed: {len(parsed_questions)}")
            print(f"Total questions in file: {final_count} (was {initial_count})")
            print("\nFirst three questions parsed:")
            # for i in range(min(3, len(parsed_questions))):
            #     print(f"\nQuestion {i+1}:")
            #     print(json.dumps(parsed_questions[i], indent=2))
            
    except Exception as e:
        print(f"An error occurred: {str(e)}")
        import traceback
        print(traceback.format_exc())