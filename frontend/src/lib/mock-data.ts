export type Difficulty = "Easy" | "Medium" | "Hard";
export type Verdict =
  | "Accepted"
  | "Wrong Answer"
  | "TLE"
  | "MLE"
  | "Runtime Error"
  | "Compilation Error"
  | "Pending";

export interface Problem {
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  acceptance: number;
  solved: boolean;
  premium?: boolean;
  description: string;
  constraints: string[];
  examples: { input: string; output: string; explanation?: string }[];
  hints: string[];
  starterCode: Record<string, string>;
}

export const problems: Problem[] = [
  {
    id: 1, slug: "two-sum", title: "Two Sum", difficulty: "Easy",
    tags: ["Array", "Hash Table"], acceptance: 54.2, solved: true,
    description: "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.",
    constraints: ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9", "Only one valid answer exists."],
    examples: [
      { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "nums[0] + nums[1] == 9" },
      { input: "nums = [3,2,4], target = 6", output: "[1,2]" },
    ],
    hints: ["A really brute force way would be to search for all possible pairs of numbers.", "Use a hash map to reduce lookup to O(1)."],
    starterCode: {
      cpp: `class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        \n    }\n};`,
      python: `class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass`,
      javascript: `/**\n * @param {number[]} nums\n * @param {number} target\n * @return {number[]}\n */\nvar twoSum = function(nums, target) {\n    \n};`,
      java: `class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        \n    }\n}`,
    },
  },
  {
    id: 2, slug: "add-two-numbers", title: "Add Two Numbers", difficulty: "Medium",
    tags: ["Linked List", "Math", "Recursion"], acceptance: 41.7, solved: true,
    description: "You are given two non-empty linked lists representing two non-negative integers. The digits are stored in reverse order, and each of their nodes contains a single digit. Add the two numbers and return the sum as a linked list.",
    constraints: ["The number of nodes in each list is in the range [1, 100].", "0 <= Node.val <= 9"],
    examples: [{ input: "l1 = [2,4,3], l2 = [5,6,4]", output: "[7,0,8]", explanation: "342 + 465 = 807." }],
    hints: ["Walk both lists simultaneously, tracking a carry."],
    starterCode: {
      cpp: `class Solution {\npublic:\n    ListNode* addTwoNumbers(ListNode* l1, ListNode* l2) {\n        \n    }\n};`,
      python: `class Solution:\n    def addTwoNumbers(self, l1, l2):\n        pass`,
      javascript: `var addTwoNumbers = function(l1, l2) {\n    \n};`,
      java: `class Solution {\n    public ListNode addTwoNumbers(ListNode l1, ListNode l2) {\n        \n    }\n}`,
    },
  },
  {
    id: 3, slug: "longest-substring", title: "Longest Substring Without Repeating Characters", difficulty: "Medium",
    tags: ["String", "Sliding Window", "Hash Table"], acceptance: 35.1, solved: false,
    description: "Given a string `s`, find the length of the longest substring without repeating characters.",
    constraints: ["0 <= s.length <= 5 * 10^4"],
    examples: [{ input: 's = "abcabcbb"', output: "3", explanation: 'The answer is "abc", with the length of 3.' }],
    hints: ["Sliding window with a hash set."],
    starterCode: { cpp: ``, python: ``, javascript: ``, java: `` },
  },
  {
    id: 4, slug: "median-two-sorted", title: "Median of Two Sorted Arrays", difficulty: "Hard",
    tags: ["Array", "Binary Search", "Divide and Conquer"], acceptance: 38.9, solved: false,
    description: "Given two sorted arrays nums1 and nums2 of size m and n respectively, return the median of the two sorted arrays. The overall run time complexity should be O(log(m+n)).",
    constraints: ["nums1.length == m", "nums2.length == n", "0 <= m <= 1000"],
    examples: [{ input: "nums1=[1,3], nums2=[2]", output: "2.00000" }],
    hints: ["Binary search the partition."],
    starterCode: { cpp: ``, python: ``, javascript: ``, java: `` },
  },
  {
    id: 5, slug: "longest-palindrome", title: "Longest Palindromic Substring", difficulty: "Medium",
    tags: ["String", "Dynamic Programming"], acceptance: 33.4, solved: true,
    description: "Given a string s, return the longest palindromic substring in s.",
    constraints: ["1 <= s.length <= 1000"], examples: [{ input: 's="babad"', output: '"bab"' }],
    hints: ["Expand around center."], starterCode: { cpp: ``, python: ``, javascript: ``, java: `` },
  },
  {
    id: 6, slug: "valid-parentheses", title: "Valid Parentheses", difficulty: "Easy",
    tags: ["Stack", "String"], acceptance: 41.2, solved: true,
    description: "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.",
    constraints: ["1 <= s.length <= 10^4"], examples: [{ input: 's="()[]{}"', output: "true" }],
    hints: ["Use a stack."], starterCode: { cpp: ``, python: ``, javascript: ``, java: `` },
  },
  {
    id: 7, slug: "merge-k-sorted", title: "Merge k Sorted Lists", difficulty: "Hard",
    tags: ["Linked List", "Heap", "Divide and Conquer"], acceptance: 49.8, solved: false,
    description: "You are given an array of k linked-lists, each linked-list is sorted in ascending order. Merge all the linked-lists into one sorted linked-list.",
    constraints: ["k == lists.length", "0 <= k <= 10^4"], examples: [{ input: "lists=[[1,4,5],[1,3,4],[2,6]]", output: "[1,1,2,3,4,4,5,6]" }],
    hints: ["Min-heap of size k."], starterCode: { cpp: ``, python: ``, javascript: ``, java: `` },
  },
  {
    id: 8, slug: "trapping-rain-water", title: "Trapping Rain Water", difficulty: "Hard",
    tags: ["Array", "Two Pointers", "Stack"], acceptance: 60.1, solved: false, premium: true,
    description: "Given n non-negative integers representing an elevation map, compute how much water it can trap after raining.",
    constraints: ["n == height.length"], examples: [{ input: "height=[0,1,0,2,1,0,1,3,2,1,2,1]", output: "6" }],
    hints: ["Two pointers from each end."], starterCode: { cpp: ``, python: ``, javascript: ``, java: `` },
  },
  {
    id: 9, slug: "best-time-stock", title: "Best Time to Buy and Sell Stock", difficulty: "Easy",
    tags: ["Array", "DP"], acceptance: 54.6, solved: true,
    description: "You are given an array prices where prices[i] is the price of a given stock on the ith day. Find the maximum profit you can achieve.",
    constraints: ["1 <= prices.length <= 10^5"], examples: [{ input: "prices=[7,1,5,3,6,4]", output: "5" }],
    hints: ["Track running min."], starterCode: { cpp: ``, python: ``, javascript: ``, java: `` },
  },
  {
    id: 10, slug: "word-ladder", title: "Word Ladder", difficulty: "Hard",
    tags: ["BFS", "Hash Table", "String"], acceptance: 38.7, solved: false,
    description: "Given two words, beginWord and endWord, and a dictionary wordList, return the number of words in the shortest transformation sequence from beginWord to endWord.",
    constraints: ["1 <= beginWord.length <= 10"], examples: [{ input: "beginWord='hit', endWord='cog'", output: "5" }],
    hints: ["BFS through word neighbors."], starterCode: { cpp: ``, python: ``, javascript: ``, java: `` },
  },
];

export const languages = [
  { id: "cpp", label: "C++ 17", monaco: "cpp" },
  { id: "python", label: "Python 3.11", monaco: "python" },
  { id: "javascript", label: "JavaScript", monaco: "javascript" },
  { id: "java", label: "Java 17", monaco: "java" },
  { id: "go", label: "Go 1.21", monaco: "go" },
  { id: "rust", label: "Rust", monaco: "rust" },
];

export type Submission = {
  id: string;
  problemId: number;
  problemTitle: string;
  verdict: Verdict;
  language: string;
  runtime: number;
  memory: number;
  timestamp: string;
};

export const submissions: Submission[] = Array.from({ length: 25 }, (_, i) => {
  const p = problems[i % problems.length];
  const verdicts: Verdict[] = ["Accepted", "Wrong Answer", "TLE", "MLE", "Runtime Error", "Compilation Error"];
  const v = verdicts[Math.floor(Math.random() * verdicts.length)];
  return {
    id: `sub_${1000 + i}`,
    problemId: p.id,
    problemTitle: p.title,
    verdict: v,
    language: languages[i % languages.length].label,
    runtime: Math.floor(Math.random() * 400) + 20,
    memory: Math.floor(Math.random() * 30) + 10,
    timestamp: new Date(Date.now() - i * 1000 * 60 * 60 * 3).toISOString(),
  };
});

export const leaderboard = Array.from({ length: 50 }, (_, i) => ({
  rank: i + 1,
  username: ["alex_codes", "jane_dev", "tourist", "petrov", "tsundere", "nyx", "rho", "kira_q", "neo", "ada_l"][i % 10] + `_${i}`,
  country: ["US", "JP", "BY", "RU", "DE", "IN", "BR", "FR", "KR", "CN"][i % 10],
  rating: 3500 - i * 35 - Math.floor(Math.random() * 20),
  solved: 800 - i * 8,
  change: Math.floor(Math.random() * 60) - 30,
  avatar: `https://api.dicebear.com/9.x/identicon/svg?seed=user${i}`,
}));

export const contests = [
  { id: 1, name: "Weekly Contest 412", startsAt: Date.now() + 1000 * 60 * 60 * 28, duration: 90, registered: 8421, status: "upcoming" as const, difficulty: "Mixed" },
  { id: 2, name: "Biweekly Contest 142", startsAt: Date.now() + 1000 * 60 * 60 * 4, duration: 90, registered: 3214, status: "upcoming" as const, difficulty: "Mixed" },
  { id: 3, name: "Codeforces Round #918", startsAt: Date.now() - 1000 * 60 * 30, duration: 120, registered: 12500, status: "live" as const, difficulty: "Div 2" },
  { id: 4, name: "Spring Challenge 2026", startsAt: Date.now() - 1000 * 60 * 60 * 72, duration: 7 * 24 * 60, registered: 24500, status: "ended" as const, difficulty: "Hard" },
];

export const discussions = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  title: [
    "Clean O(n) solution with sliding window",
    "Why does my DP keep getting TLE?",
    "Best resources to learn segment trees",
    "Hint for Trapping Rain Water without two pointers?",
    "Weekly Contest 411 — problem D discussion",
    "Editorial: Longest Palindromic Substring",
    "Interview experience at Stripe",
    "Mock interview partner needed (DP)",
    "How to approach graph problems intuitively",
    "Discussing the new contest format",
    "Bitmask DP cheat sheet",
    "Round table: competitive programming in 2026",
  ][i],
  author: ["alex_codes", "jane_dev", "tourist", "petrov", "nyx"][i % 5],
  tags: [["Tutorial"], ["Question"], ["Help"], ["Editorial"], ["Discussion"]][i % 5],
  upvotes: Math.floor(Math.random() * 500) + 5,
  comments: Math.floor(Math.random() * 80),
  createdAt: new Date(Date.now() - i * 1000 * 60 * 60 * 9).toISOString(),
}));

export const heatmap = Array.from({ length: 365 }, (_, i) => ({
  date: new Date(Date.now() - (364 - i) * 86400000).toISOString().slice(0, 10),
  count: Math.random() > 0.4 ? Math.floor(Math.random() * 8) : 0,
}));

export const ratingHistory = Array.from({ length: 24 }, (_, i) => ({
  contest: `WC ${390 + i}`,
  rating: 1400 + Math.floor(Math.sin(i / 3) * 200) + i * 25 + Math.floor(Math.random() * 80),
}));

export const submissionStats = [
  { name: "Accepted", value: 412, color: "var(--color-success)" },
  { name: "Wrong Answer", value: 138, color: "var(--color-destructive)" },
  { name: "TLE", value: 47, color: "var(--color-warning)" },
  { name: "Runtime Error", value: 21, color: "var(--color-info)" },
];

export const verdictMeta: Record<Verdict, { label: string; className: string }> = {
  Accepted: { label: "Accepted", className: "bg-success/15 text-success border-success/30" },
  "Wrong Answer": { label: "Wrong Answer", className: "bg-destructive/15 text-destructive border-destructive/30" },
  TLE: { label: "Time Limit Exceeded", className: "bg-warning/15 text-warning border-warning/30" },
  MLE: { label: "Memory Limit Exceeded", className: "bg-warning/15 text-warning border-warning/30" },
  "Runtime Error": { label: "Runtime Error", className: "bg-info/15 text-info border-info/30" },
  "Compilation Error": { label: "Compilation Error", className: "bg-muted text-muted-foreground border-border" },
  Pending: { label: "Pending", className: "bg-muted text-muted-foreground border-border" },
};

export const difficultyClass: Record<Difficulty, string> = {
  Easy: "text-success",
  Medium: "text-warning",
  Hard: "text-destructive",
};

export const notifications = [
  { id: 1, title: "Contest starting in 1 hour", body: "Weekly Contest 412 is about to begin.", time: "1h", unread: true },
  { id: 2, title: "Solution accepted", body: "Your submission for Two Sum was Accepted.", time: "3h", unread: true },
  { id: 3, title: "New discussion reply", body: "tourist replied to your post.", time: "1d", unread: false },
  { id: 4, title: "Rating updated", body: "You gained +24 rating points.", time: "2d", unread: false },
];

export const mockUser = {
  name: "Alex Carter",
  username: "alex_codes",
  email: "alex@codearena.dev",
  avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=alex",
  country: "US",
  rating: 1842,
  rank: 4218,
  solved: { easy: 142, medium: 198, hard: 47, total: 387 },
  streak: 28,
  joinedAt: "2023-04-12",
};
