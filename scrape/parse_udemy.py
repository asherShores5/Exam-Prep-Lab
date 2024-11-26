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
        
        question_dict['question'] = lines[1]
        
        current_line = 2
        options_before_correct = []
        options_after_correct = []
        
        while current_line < len(lines) and lines[current_line] != "Correct answer":
            options_before_correct.append(lines[current_line])
            current_line += 1
            
        if current_line < len(lines) and lines[current_line] == "Correct answer":
            current_line += 1
            
        while current_line < len(lines) and not lines[current_line].startswith("Overall explanation"):
            if not any(marker in lines[current_line] for marker in ["Domain", "Question ID:"]):
                options_after_correct.append(lines[current_line])
            current_line += 1
            
        all_options = options_before_correct + options_after_correct
        question_dict['options'] = all_options
        
        correct_index = len(options_before_correct)
        question_dict['correctAnswers'] = [correct_index] if all_options else []
        
        explanation_start = next((i for i, line in enumerate(lines) 
                                if line.startswith("Overall explanation")), None)
        if explanation_start is not None:
            explanation_lines = []
            i = explanation_start + 1
            while i < len(lines) and not lines[i].startswith("Domain"):
                explanation_lines.append(lines[i])
                i += 1
            explanation = ' '.join(explanation_lines)
            explanation = re.sub(r'For support.*?thank you\.', '', explanation, 
                               flags=re.IGNORECASE | re.DOTALL).strip()
            question_dict['explanation'] = explanation
        
        parsed_questions.append(question_dict)
        
        domain_line = next((line for line in lines if line.startswith("Domain")), None)
        if domain_line and domain_line != lines[-1]:
            domain_dict = {
                "question": domain_line,
                "options": [],
                "correctAnswers": [],
                "explanation": ""
            }
            parsed_questions.append(domain_dict)
    
    return parsed_questions

def append_to_json(new_questions, output_file='parsed_udemy.json'):
    existing_questions = []
    
    # Read existing questions if file exists
    if os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                existing_questions = json.load(f)
        except json.JSONDecodeError:
            print(f"Warning: Could not read existing JSON file {output_file}. Starting fresh.")
    
    # Combine existing and new questions
    all_questions = existing_questions + new_questions
    
    # Write back to file
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
            initial_count, final_count = append_to_json(parsed_questions)
            print(f"Added {len(parsed_questions)} questions to the JSON file.")
            print(f"Total questions in file: {final_count} (was {initial_count})")
            
    except Exception as e:
        print(f"An error occurred: {str(e)}")