"use client";
import { useLiveData, Notice } from "./live-data";
import WorkshopSelection from "./workshop-selection";
export default function WorkshopChoice({
  value,
  onChange,
  flow = "registration",
}: {
  value: string;
  onChange: (id: string) => void;
  flow?: "registration" | "application";
}) {
  const { data, error } = useLiveData("/api/workshops?flow=" + flow, 15000);
  return (
    <div>
      <Notice error>{error}</Notice>
      {data && (
        <WorkshopSelection
          config={data.config}
          workshops={data.workshops}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}
