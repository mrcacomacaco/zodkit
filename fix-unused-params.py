#!/usr/bin/env python3

import re
import sys
import os

def fix_unused_param(file_path, line_num, param_name):
    """Fix an unused parameter by prefixing with underscore."""
    with open(file_path, 'r') as f:
        lines = f.readlines()

    # Adjust for 0-based indexing
    line_idx = line_num - 1
    if line_idx < 0 or line_idx >= len(lines):
        return False

    line = lines[line_idx]

    # Simple replacement - prefix parameter with underscore
    # This is a simplified approach - in production you'd want AST parsing
    pattern = rf'\b{param_name}\b(?=\s*[:,)])'
    replacement = f'_{param_name}'

    new_line = re.sub(pattern, replacement, line)

    if new_line != line:
        lines[line_idx] = new_line
        with open(file_path, 'w') as f:
            f.writelines(lines)
        return True

    return False

def main():
    # Parse TypeScript errors from stdin
    fixes_applied = 0

    for line in sys.stdin:
        # Parse error line format: src/file.ts(line,col): error TS6133: 'param' is declared but its value is never read.
        match = re.match(r"(.+?)\((\d+),(\d+)\): error TS6133: '(\w+)' is declared but its value is never read\.", line)

        if match:
            file_path = match.group(1)
            line_num = int(match.group(2))
            param_name = match.group(4)

            # Only fix if file exists
            if os.path.exists(file_path):
                if fix_unused_param(file_path, line_num, param_name):
                    fixes_applied += 1
                    print(f"Fixed: {file_path}:{line_num} - prefixed '{param_name}' with underscore")

    print(f"\nTotal fixes applied: {fixes_applied}")

if __name__ == "__main__":
    main()