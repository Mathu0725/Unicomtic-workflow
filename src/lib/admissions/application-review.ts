import type { Application } from "../data/store";

export type ApplicationStatus = Application["status"];

export const applicationTransitions: Record<
  ApplicationStatus,
  readonly ApplicationStatus[]
> = {
  invited: ["started", "withdrawn"],
  started: ["submitted", "withdrawn"],
  submitted: ["under_review", "approved", "rejected", "withdrawn"],
  under_review: ["approved", "rejected", "withdrawn"],
  approved: ["under_review", "withdrawn"],
  rejected: ["under_review"],
  withdrawn: ["under_review"],
};

export function canChangeApplicationStatus(
  from: ApplicationStatus,
  to: ApplicationStatus,
) {
  return applicationTransitions[from]?.includes(to) === true;
}

export type ApplicationListItem = Application & {
  studentName: string;
  email: string;
  phone: string;
  nic: string;
  district: string;
  registrationRef: string;
  courseName: string;
};

export interface ApplicationAnswer {
  id: string;
  label: string;
  value: unknown;
}

export interface ApplicationDetails {
  application: Application;
  submissions: {
    id: string;
    formId: string;
    formTitle: string;
    createdAt: string;
    answers: ApplicationAnswer[];
  }[];
}
