export  const problems = [
  {
    id: 1,
    title: "Sum of Array",
    description: "Return the sum of all numbers in the array.",
    difficulty: "easy",
    testCases: [
      { input: [1, 2, 3, 4], expectedOutput: 10 },
      { input: [5, 5, 5], expectedOutput: 15 },
      { input: [], expectedOutput: 0 }
    ]
  },
  {
    id: 2,
    title: "Reverse String",
    description: "Return the reversed version of the given string.",
    difficulty: "easy",
    testCases: [
      { input: "hello", expectedOutput: "olleh" },
      { input: "code", expectedOutput: "edoc" },
      { input: "", expectedOutput: "" }
    ]
  },
  {
    id: 3,
    title: "Find Maximum",
    description: "Return the largest number in the array.",
    difficulty: "easy",
    testCases: [
      { input: [1, 5, 3, 9, 2], expectedOutput: 9 },
      { input: [-5, -2, -10], expectedOutput: -2 }
    ]
  },
  {
    id: 4,
    title: "Palindrome Check",
    description: "Return true if the string is a palindrome, otherwise false.",
    difficulty: "easy",
    testCases: [
      { input: "racecar", expectedOutput: true },
      { input: "hello", expectedOutput: false },
      { input: "madam", expectedOutput: true }
    ]
  },
  {
    id: 5,
    title: "FizzBuzz",
    description:
      "Return 'Fizz' if divisible by 3, 'Buzz' if divisible by 5, 'FizzBuzz' if divisible by both, otherwise return the number.",
    difficulty: "medium",
    testCases: [
      { input: 3, expectedOutput: "Fizz" },
      { input: 5, expectedOutput: "Buzz" },
      { input: 15, expectedOutput: "FizzBuzz" },
      { input: 7, expectedOutput: 7 }
    ]
  },
  {
    id: 6,
    title: "Factorial",
    description: "Return the factorial of a non-negative integer.",
    difficulty: "medium",
    testCases: [
      { input: 5, expectedOutput: 120 },
      { input: 0, expectedOutput: 1 },
      { input: 3, expectedOutput: 6 }
    ]
  },
  {
    id: 7,
    title: "Count Vowels",
    description: "Return the number of vowels in the given string.",
    difficulty: "medium",
    testCases: [
      { input: "hello", expectedOutput: 2 },
      { input: "javascript", expectedOutput: 3 },
      { input: "rhythm", expectedOutput: 0 }
    ]
  },
  {
    id: 8,
    title: "Two Sum",
    description:
      "Given an array and a target, return true if any two numbers add up to the target.",
    difficulty: "medium",
    testCases: [
      { input: { nums: [2, 7, 11, 15], target: 9 }, expectedOutput: true },
      { input: { nums: [1, 2, 3], target: 7 }, expectedOutput: false }
    ]
  },
  {
    id: 9,
    title: "Longest Word",
    description: "Return the longest word in a sentence.",
    difficulty: "medium",
    testCases: [
      {
        input: "The quick brown fox jumps",
        expectedOutput: "quick"
      },
      {
        input: "JavaScript is awesome",
        expectedOutput: "JavaScript"
      }
    ]
  },
  {
    id: 10,
    title: "Valid Parentheses",
    description:
      "Return true if all parentheses are correctly matched and closed.",
    difficulty: "hard",
    testCases: [
      { input: "()[]{}", expectedOutput: true },
      { input: "([)]", expectedOutput: false },
      { input: "{[]}", expectedOutput: true }
    ]
  },
  {
  id: 11,
  title: "Longest Substring Without Repeating Characters",
  description:
    "Return the length of the longest substring that contains no repeated characters.",
  difficulty: "hard",
  testCases: [
    { input: "abcabcbb", expectedOutput: 3 },
    { input: "bbbbb", expectedOutput: 1 },
    { input: "pwwkew", expectedOutput: 3 }
  ]
},
{
  id: 12,
  title: "Product of Array Except Self",
  description:
    "Return an array where each element is the product of all other elements.",
  difficulty: "hard",
  testCases: [
    { input: [1,2,3,4], expectedOutput: [24,12,8,6] },
    { input: [2,3,4,5], expectedOutput: [60,40,30,24] }
  ]
},
{
  id: 13,
  title: "Rotate Matrix",
  description:
    "Rotate a square matrix 90 degrees clockwise.",
  difficulty: "hard",
  testCases: [
    {
      input: [[1,2],[3,4]],
      expectedOutput: [[3,1],[4,2]]
    },
    {
      input: [[1,2,3],[4,5,6],[7,8,9]],
      expectedOutput: [[7,4,1],[8,5,2],[9,6,3]]
    }
  ]
},
{
  id: 14,
  title: "Group Anagrams",
  description:
    "Group words that are anagrams of each other.",
  difficulty: "hard",
  testCases: [
    {
      input: ["eat","tea","tan","ate","nat","bat"],
      expectedOutput: [["eat","tea","ate"],["tan","nat"],["bat"]]
    }
  ]
},
{
  id: 15,
  title: "Merge Intervals",
  description:
    "Merge all overlapping intervals.",
  difficulty: "hard",
  testCases: [
    {
      input: [[1,3],[2,6],[8,10],[15,18]],
      expectedOutput: [[1,6],[8,10],[15,18]]
    }
  ]
},
{
  id: 16,
  title: "Word Frequency",
  description:
    "Return an object containing the frequency of each word in a sentence.",
  difficulty: "hard",
  testCases: [
    {
      input: "the cat and the dog",
      expectedOutput: {
        the: 2,
        cat: 1,
        and: 1,
        dog: 1
      }
    }
  ]
},
{
  id: 17,
  title: "Evaluate Postfix Expression",
  description:
    "Evaluate a postfix expression and return the result.",
  difficulty: "hard",
  testCases: [
    { input: "23+5*", expectedOutput: 25 },
    { input: "82/3+", expectedOutput: 7 }
  ]
},
{
  id: 18,
  title: "LRU Cache Simulator",
  description:
    "Given a cache size and sequence of accesses, return the final cache contents.",
  difficulty: "hard",
  testCases: [
    {
      input: {
        capacity: 2,
        accesses: [1,2,1,3]
      },
      expectedOutput: [1,3]
    }
  ]
},
{
  id: 19,
  title: "Sudoku Validator",
  description:
    "Return true if a Sudoku board is valid.",
  difficulty: "hard",
  testCases: [
    {
      input: [
        ["5","3",".",".","7",".",".",".","."],
        ["6",".",".","1","9","5",".",".","."],
        [".","9","8",".",".",".",".","6","."]
      ],
      expectedOutput: true
    }
  ]
},
{
  id: 20,
  title: "Shortest Path in Grid",
  description:
    "Find the shortest path length from top-left to bottom-right in a grid with obstacles.",
  difficulty: "hard",
  testCases: [
    {
      input: [
        [0,0,0],
        [1,1,0],
        [0,0,0]
      ],
      expectedOutput: 4
    }
  ]
}
];

