import json

def merge_json_files(file1_path, file2_path, output_path):
    """
    Merge two JSON files containing quiz questions, avoiding duplicates based on question text.
    
    Parameters:
    file1_path (str): Path to first JSON file
    file2_path (str): Path to second JSON file
    output_path (str): Path to save merged JSON file
    
    Returns:
    tuple: (int, int) - (total questions in merged file, number of duplicates found)
    """
    # Read both JSON files
    with open(file1_path, 'r') as f1:
        data1 = json.load(f1)
    
    with open(file2_path, 'r') as f2:
        data2 = json.load(f2)
    
    # Create a dictionary using questions as keys to handle duplicates
    question_dict = {}
    duplicates = 0
    
    # Process first file
    for item in data1:
        question_dict[item['question']] = item
    
    # Process second file, counting duplicates
    for item in data2:
        if item['question'] in question_dict:
            duplicates += 1
            # If you want to keep the second file's version of duplicates,
            # uncomment the next line
            # question_dict[item['question']] = item
        else:
            question_dict[item['question']] = item
    
    # Convert back to list
    merged_data = list(question_dict.values())
    
    # Sort by question text for consistency
    merged_data.sort(key=lambda x: x['question'])
    
    # Write merged data to output file - FIXED THIS LINE
    with open(output_path, 'w') as outfile:
        json.dump(merged_data, outfile, indent=2)
    
    return len(merged_data), duplicates

def print_merge_stats(file1_path, file2_path, output_path):
    """
    Print statistics about the merge operation
    """
    with open(file1_path, 'r') as f1:
        count1 = len(json.load(f1))
    
    with open(file2_path, 'r') as f2:
        count2 = len(json.load(f2))
    
    total_merged, duplicates = merge_json_files(file1_path, file2_path, output_path)
    
    print(f"\nMerge Statistics:")
    print(f"Questions in first file: {count1}")
    print(f"Questions in second file: {count2}")
    print(f"Duplicate questions found: {duplicates}")
    print(f"Total questions in merged file: {total_merged}")
    print(f"Merged file saved to: {output_path}")

if __name__ == "__main__":
    # Example usage
    file1_path = "output.json"
    file2_path = "da.json"
    output_path = "merged_questions.json"
    
    print_merge_stats(file1_path, file2_path, output_path)