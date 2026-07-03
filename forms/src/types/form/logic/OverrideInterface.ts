export interface Override {
  questionId: string;
  merge: Merge;
}

interface Merge {
  options: string[];
}
