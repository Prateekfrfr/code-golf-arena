"use client";

import React from "react";
import type { Language } from "@/types/domain";

const languageLabels: Record<Language, string> = {
  python: "Python",
  javascript: "JavaScript",
  cpp: "C++",
  java: "Java",
};

const submissionExamples: Record<Language, string> = {
  python: `import sys

def main():
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    nums = [int(x) for x in data[1:n+1]]
    print(sum(nums))

if __name__ == "__main__":
    main()`,
  javascript: `const fs = require("fs");

function main() {
  const input = fs.readFileSync(0, "utf8").trim();
  if (!input) return;
  const tokens = input.split(/\\s+/);
  const n = parseInt(tokens[0], 10);
  const sum = tokens.slice(1, n + 1).map(Number).reduce((a, b) => a + b, 0);
  console.log(sum);
}

main();`,
  cpp: `#include <iostream>
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  int n;
  if (cin >> n) {
    long long sum = 0, x;
    for (int i = 0; i < n && cin >> x; ++i) sum += x;
    cout << sum << "\\n";
  }
  return 0;
}`,
  java: `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    if (in.hasNextInt()) {
      int n = in.nextInt();
      long sum = 0;
      for (int i = 0; i < n && in.hasNextInt(); i++) {
        sum += in.nextInt();
      }
      System.out.println(sum);
    }
  }
}`,
};

export function SubmissionGuide({
  supportedLanguages = ["python", "javascript", "cpp", "java"],
  variant = "standalone",
}: {
  supportedLanguages?: Language[];
  variant?: "standalone" | "panel";
}) {
  const activeLanguages = supportedLanguages.length
    ? supportedLanguages
    : (["python", "javascript", "cpp", "java"] as Language[]);

  if (variant === "panel") {
    return (
      <details className="problem-details submission-guide-panel">
        <summary>
          <span>How to submit code</span>
        </summary>
        <div className="problem-detail-list">
          <p style={{ margin: "4px 0 8px", fontSize: "12px", lineHeight: "1.5" }}>
            Submit a complete program reading standard input (stdin) and writing to standard output (stdout), Codeforces-style. Do not use LeetCode-style <code>class Solution</code> wrappers.
          </p>
          <div className="submission-example-grid">
            {activeLanguages.map((lang) => (
              <div className="submission-example" key={lang}>
                <strong>{languageLabels[lang] || lang}</strong>
                <pre>{submissionExamples[lang]}</pre>
              </div>
            ))}
          </div>
        </div>
      </details>
    );
  }

  return (
    <details className="submission-guide">
      <summary>
        <span>How to submit code</span>
        <span className="badge">format</span>
      </summary>
      <div className="submission-guide-body">
        <p>
          Submit a complete program that reads from standard input and writes
          the exact answer to standard output. Use the format the judge runs
          directly, similar to Codeforces: include a full entry point such as{" "}
          <code>main()</code>, not a LeetCode-style <code>class Solution</code>{" "}
          wrapper.
        </p>
        <div className="submission-example-grid">
          {activeLanguages.map((lang) => (
            <div className="submission-example" key={lang}>
              <strong>{languageLabels[lang] || lang}</strong>
              <pre>{submissionExamples[lang]}</pre>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
