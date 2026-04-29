import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'seeker' | 'employer' | 'super_admin';
  onboardingComplete: boolean;
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  city: string;
  skills: string[];
  experience: string;
  education: string;
  interests: string[];
  currentRole: string;
  desiredRole: string;
  about: string;
  languages: string[];
  projects: string;
}

export interface OnboardingAnswer {
  question: string;
  answer: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface InterviewAnalytics {
  confidenceScore: number;
  anxietyLevel: string;
  responseQuality: number;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  overallFeedback: string;
  detailedAnalysis: string;
}

export interface JobApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  candidateName: string;
  phone: string;
  telegram: string;
  coverLetter: string;
  createdAt: number;
  status: 'submitted';
}

interface AppState {
  hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;

  userRole: 'seeker' | 'employer' | 'super_admin' | null;
  setUserRole: (role: 'seeker' | 'employer' | 'super_admin' | null) => void;

  onboardingStep: number;
  onboardingAnswers: OnboardingAnswer[];
  onboardingComplete: boolean;
  setOnboardingStep: (step: number) => void;
  addOnboardingAnswer: (answer: OnboardingAnswer) => void;
  setOnboardingComplete: (complete: boolean) => void;

  userProfile: UserProfile;
  setUserProfile: (profile: Partial<UserProfile>) => void;

  interviewMessages: ChatMessage[];
  interviewJobId: string | null;
  interviewActive: boolean;
  interviewAnalytics: InterviewAnalytics | null;
  addInterviewMessage: (message: ChatMessage) => void;
  setInterviewJobId: (id: string | null) => void;
  setInterviewActive: (active: boolean) => void;
  setInterviewAnalytics: (analytics: InterviewAnalytics | null) => void;
  clearInterview: () => void;

  employerJobs: Array<{
    id: string;
    title: string;
    description: string;
    requirements: string[];
    skills: string[];
    salary: string;
    location: string;
    type: string;
  }>;
  addEmployerJob: (job: AppState['employerJobs'][0]) => void;

  generatedResume: string | null;
  setGeneratedResume: (resume: string | null) => void;

  applications: JobApplication[];
  addApplication: (application: JobApplication) => void;

  authToken: string | null;
  authUser: AuthUser | null;
  setAuthSession: (token: string, user: AuthUser) => void;
  clearAuthSession: () => void;

  resetAll: () => void;
}

const initialProfile: UserProfile = {
  name: '',
  email: '',
  phone: '',
  city: '',
  skills: [],
  experience: '',
  education: '',
  interests: [],
  currentRole: '',
  desiredRole: '',
  about: '',
  languages: [],
  projects: '',
};

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),

      userRole: null,
      setUserRole: (role) => set({ userRole: role }),

      onboardingStep: 0,
      onboardingAnswers: [],
      onboardingComplete: false,
      setOnboardingStep: (step) => set({ onboardingStep: step }),
      addOnboardingAnswer: (answer) =>
        set((state) => ({
          onboardingAnswers: [...state.onboardingAnswers, answer],
        })),
      setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),

      userProfile: initialProfile,
      setUserProfile: (profile) =>
        set((state) => ({
          userProfile: { ...state.userProfile, ...profile },
        })),

      interviewMessages: [],
      interviewJobId: null,
      interviewActive: false,
      interviewAnalytics: null,
      addInterviewMessage: (message) =>
        set((state) => ({
          interviewMessages: [...state.interviewMessages, message],
        })),
      setInterviewJobId: (id) => set({ interviewJobId: id }),
      setInterviewActive: (active) => set({ interviewActive: active }),
      setInterviewAnalytics: (analytics) => set({ interviewAnalytics: analytics }),
      clearInterview: () =>
        set({
          interviewMessages: [],
          interviewJobId: null,
          interviewActive: false,
          interviewAnalytics: null,
        }),

      employerJobs: [],
      addEmployerJob: (job) =>
        set((state) => ({
          employerJobs: [...state.employerJobs, job],
        })),

      generatedResume: null,
      setGeneratedResume: (resume) => set({ generatedResume: resume }),

      applications: [],
      addApplication: (application) =>
        set((state) => ({
          applications: [application, ...state.applications],
        })),

      authToken: null,
      authUser: null,
      setAuthSession: (token, user) =>
        set({
          authToken: token,
          authUser: user,
          userRole: user.role,
          onboardingComplete: user.onboardingComplete,
        }),
      clearAuthSession: () =>
        set({ authToken: null, authUser: null }),

      resetAll: () =>
        set({
          hasHydrated: true,
          userRole: null,
          onboardingStep: 0,
          onboardingAnswers: [],
          onboardingComplete: false,
          userProfile: initialProfile,
          interviewMessages: [],
          interviewJobId: null,
          interviewActive: false,
          interviewAnalytics: null,
          employerJobs: [],
          generatedResume: null,
          applications: [],
          authToken: null,
          authUser: null,
        }),
    }),
    {
      name: 'prof-ai-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
