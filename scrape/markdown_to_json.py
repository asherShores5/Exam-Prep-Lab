import re
import json

def parse_md_quiz(md_content, start_marker="###"):
    start_idx = md_content.find(start_marker)
    if start_idx == -1:
        return []
        
    content = md_content[start_idx:]
    questions = []
    question_blocks = content.strip().split('**[⬆ Back to Top](#table-of-contents)**')
    
    for block in question_blocks:
        if not block.strip():
            continue
            
        # Extract question and check for multiple answers indicator
        question_match = re.search(r'###\s*(.*?)\n', block)
        if not question_match:
            continue
        
        question = question_match.group(1).strip()
        
        # Extract options and correct answers
        options = []
        correct_answers = []
        option_matches = re.findall(r'-\s*\[([ x])\]\s*(.*?)(?=\n|$)', block)
        
        for idx, (is_correct, option_text) in enumerate(option_matches):
            options.append(option_text.strip())
            if is_correct.lower() == 'x':
                correct_answers.append(idx)
        
        if question and options and correct_answers:
            questions.append({
                "question": question,
                "options": options,
                "correctAnswers": correct_answers,
                "explanation": ""
            })
    
    return questions

def convert_md_to_json(input_md_file, output_json_file):
    try:
        with open(input_md_file, 'r', encoding='utf-8') as f:
            content = f.read()
        questions = parse_md_quiz(content, start_marker='START_QUIZ')
        with open(output_json_file, 'w', encoding='utf-8') as f:
            json.dump(questions, f, indent=2)
        print(f"Successfully converted {input_md_file} to {output_json_file}")
    except Exception as e:
        print(f"Error: {e}")

# Example usage
convert_md_to_json('input.md', 'quiz_output.json')