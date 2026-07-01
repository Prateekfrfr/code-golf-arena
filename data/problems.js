export const problems = [
  {
    id: 1,
    title: "Sum of Array",
    topic: "arrays",
    description: "Input: one line of space-separated integers.\nOutput: print one integer, the sum of all numbers.\nExample: input '1 2 3 4' -> output '10'",
    difficulty: "easy",
    testCases: [
      { input: "1 2 3 4", expectedOutput: "10" },
      { input: "5 5 5", expectedOutput: "15" },
      { input: "0", expectedOutput: "0" }
    ]
  },
  {
    id: 2,
    title: "Reverse String",
    topic: "strings",
    description: "Input: one line containing a string.\nOutput: print the string reversed.\nExample: input 'hello' -> output 'olleh'",
    difficulty: "easy",
    testCases: [
      { input: "hello", expectedOutput: "olleh" },
      { input: "code", expectedOutput: "edoc" },
      { input: "a", expectedOutput: "a" }
    ]
  },
  {
    id: 3,
    title: "Find Maximum",
    topic: "arrays",
    description: "Input: one line of space-separated integers.\nOutput: print one integer, the largest value.\nExample: input '1 5 3 9 2' -> output '9'",
    difficulty: "easy",
    testCases: [
      { input: "1 5 3 9 2", expectedOutput: "9" },
      { input: "-5 -2 -10", expectedOutput: "-2" }
    ]
  },
  {
    id: 4,
    title: "Palindrome Check",
    topic: "strings",
    description: "Input: one line containing a string.\nOutput: print True if the string is a palindrome, otherwise print False.",
    difficulty: "easy",
    testCases: [
      { input: "racecar", expectedOutput: "True" },
      { input: "hello", expectedOutput: "False" },
      { input: "madam", expectedOutput: "True" }
    ]
  },
  {
    id: 5,
    title: "FizzBuzz",
    topic: "math",
    description: "Input: one integer n.\nOutput: print Fizz if n is divisible by 3, Buzz if n is divisible by 5, FizzBuzz if both, otherwise print n.",
    difficulty: "easy",
    testCases: [
      { input: "3", expectedOutput: "Fizz" },
      { input: "5", expectedOutput: "Buzz" },
      { input: "15", expectedOutput: "FizzBuzz" },
      { input: "7", expectedOutput: "7" }
    ]
  },
  {
    id: 6,
    title: "Factorial",
    topic: "dp",
    description: "Input: one non-negative integer n.\nOutput: print n factorial as an integer.",
    difficulty: "medium",
    testCases: [
      { input: "5", expectedOutput: "120" },
      { input: "0", expectedOutput: "1" },
      { input: "3", expectedOutput: "6" }
    ]
  },
  {
    id: 7,
    title: "Count Vowels",
    topic: "strings",
    description: "Input: one line containing a string.\nOutput: print the number of vowels (a, e, i, o, u) in the string.",
    difficulty: "medium",
    testCases: [
      { input: "hello", expectedOutput: "2" },
      { input: "javascript", expectedOutput: "3" },
      { input: "rhythm", expectedOutput: "0" }
    ]
  },
  {
    id: 8,
    title: "Two Sum Check",
    topic: "arrays",
    description: "Input: first line has space-separated integers. Second line has the target integer.\nOutput: print True if any two numbers add up to the target, otherwise print False.",
    difficulty: "medium",
    testCases: [
      { input: "2 7 11 15\n9", expectedOutput: "True" },
      { input: "1 2 3\n7", expectedOutput: "False" }
    ]
  },
  {
    id: 9,
    title: "Longest Word",
    topic: "strings",
    description: "Input: one line containing a sentence.\nOutput: print the longest word. If multiple words tie, print the first one.",
    difficulty: "medium",
    testCases: [
      { input: "The quick brown fox jumps", expectedOutput: "quick" },
      { input: "JavaScript is awesome", expectedOutput: "JavaScript" }
    ]
  },
  {
    id: 10,
    title: "Valid Parentheses",
    topic: "stacks",
    description: "Input: one line containing only bracket characters.\nOutput: print True if all brackets are correctly matched, otherwise print False.",
    difficulty: "medium",
    testCases: [
      { input: "()[]{}", expectedOutput: "True" },
      { input: "([)]", expectedOutput: "False" },
      { input: "{[]}", expectedOutput: "True" }
    ]
  },
  {
    id: 11,
    title: "Longest Substring Without Repeating Characters",
    topic: "strings",
    description: "Input: one line containing a string.\nOutput: print the length of the longest substring with no repeated characters.",
    difficulty: "hard",
    testCases: [
      { input: "abcabcbb", expectedOutput: "3" },
      { input: "bbbbb", expectedOutput: "1" },
      { input: "pwwkew", expectedOutput: "3" }
    ]
  },
  {
    id: 12,
    title: "Evaluate Postfix Expression",
    topic: "stacks",
    description: "Input: one line containing a postfix expression using single-digit operands and operators.\nOutput: print the integer result.",
    difficulty: "hard",
    testCases: [
      { input: "23+5*", expectedOutput: "25" },
      { input: "82/3+", expectedOutput: "7" }
    ]
  },
  {
    id: 13,
    title: "Shortest Path in Grid",
    topic: "graphs",
    description: "Input: first line has grid dimensions N M. The next N lines each contain M values, where 1 means obstacle and 0 means open cell.\nOutput: print the shortest path length from top-left to bottom-right, or -1 if impossible.",
    difficulty: "hard",
    testCases: [
      { input: "3 3\n0 0 0\n1 1 0\n0 0 0", expectedOutput: "4" },
      { input: "2 2\n0 1\n1 0", expectedOutput: "-1" }
    ]
  },
  {
    id: 14,
    title: "Word Frequency",
    topic: "hashing",
    description: "Input: one line containing a sentence.\nOutput: print each distinct word and its frequency, one per line, in order of first appearance.",
    difficulty: "hard",
    testCases: [
      { input: "the cat and the dog", expectedOutput: "the 2\ncat 1\nand 1\ndog 1" }
    ]
  },
  {
    id: 15,
    title: "Merge Intervals",
    topic: "arrays",
    description: "Input: multiple lines. Each line has two integers representing an interval start and end.\nOutput: print merged intervals, one per line, as 'start end'.",
    difficulty: "hard",
    testCases: [
      { input: "1 3\n2 6\n8 10\n15 18", expectedOutput: "1 6\n8 10\n15 18" }
    ]
  }
];
