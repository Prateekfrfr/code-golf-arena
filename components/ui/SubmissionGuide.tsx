"use client";

import { useId, useState, type KeyboardEvent } from "react";
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

// One example at a time, full width, so the code is readable instead of
// four clipped columns.
function SubmissionExamples({ languages }: { languages: Language[] }) {
  const [active, setActive] = useState<Language>(languages[0]);
  const baseId = useId();
  const current = languages.includes(active) ? active : languages[0];

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = languages.indexOf(current);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % languages.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + languages.length) % languages.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = languages.length - 1;
    else return;

    event.preventDefault();
    setActive(languages[next]);
    document.getElementById(`${baseId}-tab-${languages[next]}`)?.focus();
  };

  return (
    <div className="submission-examples">
      <div
        className="submission-tabs"
        role="tablist"
        aria-label="Example language"
      >
        {languages.map((lang) => {
          const selected = lang === current;
          return (
            <button
              key={lang}
              id={`${baseId}-tab-${lang}`}
              type="button"
              role="tab"
              className="submission-tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(lang)}
              onKeyDown={handleKeyDown}
            >
              {languageLabels[lang] || lang}
            </button>
          );
        })}
      </div>
      <pre
        id={`${baseId}-panel`}
        className="submission-code"
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${current}`}
        tabIndex={0}
      >
        {submissionExamples[current]}
      </pre>
    </div>
  );
}

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
          <SubmissionExamples languages={activeLanguages} />
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
        <SubmissionExamples languages={activeLanguages} />
      </div>
    </details>
  );
}
