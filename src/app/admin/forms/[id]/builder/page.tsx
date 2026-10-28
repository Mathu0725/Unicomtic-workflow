"use client";
import { useParams } from "next/navigation";
import FormBuilderEditor from "@/components/form-builder/editor";
export default function FormBuilderPage() {
  const params = useParams();
  return <FormBuilderEditor key={String(params.id)} id={String(params.id)} />;
}
