"use client"

// ============================================================
// FeedbackPro - Accordion FAQ (client)
// Encapsule l'Accordion shadcn (qui nécessite un client) pour
// pouvoir être utilisé dans une page serveur (/faq).
// ============================================================

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export type FaqItem = { q: string; r: string }

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {items.map((item, i) => (
        <AccordionItem
          key={i}
          value={`item-${i}`}
          className="mb-3 rounded-2xl border border-gray-200 bg-white px-5 shadow-sm [&:not(:last-child)]:mb-3"
        >
          <AccordionTrigger className="text-left text-base font-semibold text-gray-900 hover:no-underline">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-sm leading-relaxed text-gray-600">
            {item.r}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
