export interface ElementInfo {
  id: number;
  tag: string;
  type?: string;
  role?: string;
  label: string;
  href?: string;
  inViewport: boolean;
  disabled: boolean;
}

export interface PageState {
  url: string;
  title: string;
  scrollPercent: number;
  elements: ElementInfo[];
}
