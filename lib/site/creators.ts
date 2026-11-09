/**
 * Streamers shown on /creators. Empty until real people agree to be listed;
 * the owner adds them.
 */
export type Creator = {
  name: string;
  url: string;
  blurb: string;
};

export const CREATORS: Creator[] = [];
