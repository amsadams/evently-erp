"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import { Modal } from "@/components/ui/overlays";
import { Alert, Button, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export interface FieldDef {
  name: string; label: string; type?: "text" | "email" | "tel" | "number" | "date" | "time" | "select" | "textarea" | "money" | "checkbox";
  options?: { value: string; label: string }[]; placeholder?: string; hint?: string; span?: 1 | 2; required?: boolean; step?: number; min?: number;
}

/** Schema-driven modal form: React Hook Form + Zod. Return a string from onSubmit to show an error and keep the dialog open. */
export function FormDialog({
  open, onOpenChange, title, description, schema, fields, defaultValues, onSubmit, submitLabel = "Save", size = "md", extra,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; schema: ZodType<any, any>; fields: FieldDef[];
  defaultValues: Record<string, any>; onSubmit: (values: any) => string | void | Promise<string | void>; submitLabel?: string; size?: "sm" | "md" | "lg"; extra?: React.ReactNode;
}) {
  const form = useForm<any>({ resolver: zodResolver(schema as any), defaultValues, mode: "onTouched" });
  const [serverError, setServerError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (open) { form.reset(defaultValues); setServerError(""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    try {
      const res = await onSubmit(values);
      if (typeof res === "string" && res) setServerError(res);
      else onOpenChange(false);
    } finally { setBusy(false); }
  });
  const err = (n: string) => (form.formState.errors as any)[n]?.message as string | undefined;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} size={size}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} loading={busy}>{submitLabel}</Button></>}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        {serverError && <Alert tone="danger" className="sm:col-span-2">{serverError}</Alert>}
        {fields.map((f) => (
          <Field key={f.name} label={f.label} error={err(f.name)} hint={f.hint} required={f.required} className={cn(f.span === 2 || f.type === "textarea" ? "sm:col-span-2" : "")}>
            {f.type === "select" ? (
              <Select {...form.register(f.name)}>
                {!f.required && <option value="">—</option>}
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : f.type === "textarea" ? (
              <Textarea placeholder={f.placeholder} {...form.register(f.name)} />
            ) : f.type === "money" ? (
              <Controller control={form.control} name={f.name} render={({ field }) => <MoneyInput value={field.value ?? 0} onChange={field.onChange} />} />
            ) : f.type === "checkbox" ? (
              <input type="checkbox" className="h-4 w-4 accent-primary" {...form.register(f.name)} />
            ) : f.type === "number" ? (
              <Input type="number" step={f.step ?? 1} min={f.min} placeholder={f.placeholder} {...form.register(f.name, { valueAsNumber: true })} />
            ) : (
              <Input type={f.type ?? "text"} placeholder={f.placeholder} {...form.register(f.name)} />
            )}
          </Field>
        ))}
        {extra}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
