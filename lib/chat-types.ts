export type ChatCard =
  | {
      type: "services"
      title: string
      items: Array<{ id: number; name: string; description: string; detail: string; gender: string; category: string; duration: number; price: number; deposit: number }>
    }
  | { type: "slots"; service: string; items: Array<{ start: string; label: string }> }
  | { type: "payment"; bookingId: string; rows: Array<[string, string]>; amount: number; checkoutUrl: string | null; whatsappUrl: string; transfer: { alias: string; holder: string; bank: string; cbu: string } | null }
  | { type: "confirmed"; bookingId: string; rows: Array<[string, string]> }
  | { type: "map"; address: string; embedUrl: string; directionsUrl: string }
  | { type: "whatsapp"; reason: string; url: string }

export type ChatOutput = { text: string } | { card: ChatCard }

export type ChatResponse = { ok: true; responseId: string; outputs: ChatOutput[] } | { ok: false; error: string }
