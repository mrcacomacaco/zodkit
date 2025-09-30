#!/usr/bin/env python3

import json
import subprocess
import re
import os

def get_eslint_errors():
    """Get only the error violations from ESLint"""
    result = subprocess.run(['npx', 'eslint', 'src', '--format=json'],
                          capture_output=True, text=True, cwd='.')
    data = json.loads(result.stdout)

    errors = []
    for file_result in data:
        file_path = file_result['filePath']
        for message in file_result['messages']:
            if message['severity'] == 2:  # Only errors, not warnings
                errors.append({
                    'file': file_path,
                    'line': message['line'],
                    'rule': message['ruleId'],
                    'message': message['message']
                })
    return errors

def fix_unused_vars(errors):
    """Remove unused variable declarations"""
    unused_vars = [e for e in errors if e['rule'] == '@typescript-eslint/no-unused-vars']

    files_to_fix = {}
    for error in unused_vars:
        file_path = error['file']
        if file_path not in files_to_fix:
            files_to_fix[file_path] = []
        files_to_fix[file_path].append(error)

    for file_path, file_errors in files_to_fix.items():
        print(f"Fixing unused vars in {os.path.basename(file_path)}...")

        with open(file_path, 'r') as f:
            lines = f.readlines()

        # Sort by line number descending to avoid offset issues
        file_errors.sort(key=lambda x: x['line'], reverse=True)

        for error in file_errors:
            line_idx = error['line'] - 1
            line = lines[line_idx]

            # Common patterns for unused vars
            patterns = [
                r'^\s*const\s+\w+\s*=.*?;\s*$',  # const unused = ...;
                r'^\s*let\s+\w+\s*=.*?;\s*$',    # let unused = ...;
                r'^\s*var\s+\w+\s*=.*?;\s*$',    # var unused = ...;
                r'^\s*import\s*\{[^}]*\}\s*from.*?;\s*$',  # import { unused } from ...;
                r'^\s*import\s+\w+\s+from.*?;\s*$',  # import unused from ...;
            ]

            for pattern in patterns:
                if re.match(pattern, line):
                    lines[line_idx] = ''  # Remove the line
                    break

        with open(file_path, 'w') as f:
            f.writelines(lines)

def fix_require_imports(errors):
    """Convert require() to import statements"""
    require_errors = [e for e in errors if e['rule'] == '@typescript-eslint/no-require-imports']

    files_to_fix = {}
    for error in require_errors:
        file_path = error['file']
        if file_path not in files_to_fix:
            files_to_fix[file_path] = []
        files_to_fix[file_path].append(error)

    for file_path, file_errors in files_to_fix.items():
        print(f"Fixing require imports in {os.path.basename(file_path)}...")

        with open(file_path, 'r') as f:
            content = f.read()

        # Common require patterns
        patterns = [
            (r'const\s+(\w+)\s*=\s*require\([\'"]([^\'"]+)[\'"]\)', r'import \1 from "\2"'),
            (r'const\s+\{([^}]+)\}\s*=\s*require\([\'"]([^\'"]+)[\'"]\)', r'import { \1 } from "\2"'),
            (r'import\([\'"]([^\'"]+)[\'"]\)', r'await import("\1")'),
        ]

        for pattern, replacement in patterns:
            content = re.sub(pattern, replacement, content)

        with open(file_path, 'w') as f:
            f.write(content)

def main():
    print("🔧 Fixing ESLint errors systematically...")

    errors = get_eslint_errors()
    print(f"Found {len(errors)} error violations")

    # Fix unused variables (biggest category)
    fix_unused_vars(errors)

    # Fix require imports
    fix_require_imports(errors)

    # Check results
    print("✅ Fixes applied. Checking remaining errors...")
    final_errors = get_eslint_errors()
    print(f"Remaining errors: {len(final_errors)}")

    if len(final_errors) < len(errors):
        print(f"🎉 Reduced errors by {len(errors) - len(final_errors)}")

if __name__ == '__main__':
    main()