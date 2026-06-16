export const problems = [
  {
    id: 1,
    title: "Sum of Array",
    description: "Read space-separated integers and print their sum.\nExample: input '1 2 3 4' → output '10'",
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
    description: "Read a string and print it reversed.\nExample: input 'hello' → output 'olleh'",
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
    description: "Read space-separated integers and print the largest.\nExample: input '1 5 3 9 2' → output '9'",
    difficulty: "easy",
    testCases: [
      { input: "1 5 3 9 2", expectedOutput: "9" },
      { input: "-5 -2 -10", expectedOutput: "-2" }
    ]
  },
  {
    id: 4,
    title: "Palindrome Check",
    description: "Read a string and print True if it is a palindrome, otherwise False.",
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
    description: "Read a number. Print 'Fizz' if divisible by 3, 'Buzz' if by 5, 'FizzBuzz' if both, else the number.",
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
    description: "Read a non-negative integer and print its factorial.",
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
    description: "Read a string and print the number of vowels (a, e, i, o, u).",
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
    description: "First line: space-separated integers. Second line: target number.\nPrint True if any two numbers add up to target, else False.",
    difficulty: "medium",
    testCases: [
      { input: "2 7 11 15\n9", expectedOutput: "True" },
      { input: "1 2 3\n7", expectedOutput: "False" }
    ]
  },
  {
    id: 9,
    title: "Longest Word",
    description: "Read a sentence and print the longest word. If tie, print the first one.",
    difficulty: "medium",
    testCases: [
      { input: "The quick brown fox jumps", expectedOutput: "quick" },
      { input: "JavaScript is awesome", expectedOutput: "JavaScript" }
    ]
  },
  {
    id: 10,
    title: "Valid Parentheses",
    description: "Read a string of brackets. Print True if all are correctly matched, else False.",
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
    description: "Read a string and print the length of the longest substring with no repeated characters.",
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
    description: "Read a postfix expression and print the result.",
    difficulty: "hard",
    testCases: [
      { input: "23+5*", expectedOutput: "25" },
      { input: "82/3+", expectedOutput: "7" }
    ]
  },
  {
    id: 13,
    title: "Shortest Path in Grid",
    description: "First line: grid dimensions N M. Next N lines: rows of 0s and 1s (1=obstacle).\nPrint the shortest path length from top-left to bottom-right, or -1 if impossible.",
    difficulty: "hard",
    testCases: [
      { input: "3 3\n0 0 0\n1 1 0\n0 0 0", expectedOutput: "4" },
      { input: "2 2\n0 1\n1 0", expectedOutput: "-1" }
    ]
  },
  {
    id: 14,
    title: "Word Frequency",
    description: "Read a sentence and print each word and its frequency, one per line, in order of appearance.",
    difficulty: "hard",
    testCases: [
      { input: "the cat and the dog", expectedOutput: "the 2\ncat 1\nand 1\ndog 1" }
    ]
  },
  {
    id: 15,
    title: "Merge Intervals",
    description: "Each line has two integers representing an interval. Print merged intervals, one per line.",
    difficulty: "hard",
    testCases: [
      { input: "1 3\n2 6\n8 10\n15 18", expectedOutput: "1 6\n8 10\n15 18" }
    ]
  }
];