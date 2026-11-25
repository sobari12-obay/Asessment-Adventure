import { DEFAULT_SCHOOL_ID, DEFAULT_SCHOOL_NAME, type AppSettings } from '../types/psas';
import { DEFAULT_INTRO_STORY } from './worlds';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'app_config',
  schoolId: DEFAULT_SCHOOL_ID,
  schoolName: DEFAULT_SCHOOL_NAME,
  defaultIntroStory: DEFAULT_INTRO_STORY,
  defaultKkm: 75,
};
