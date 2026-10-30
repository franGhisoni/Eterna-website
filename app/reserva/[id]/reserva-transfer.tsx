"use client"

import { useRouter } from "next/navigation"
import { TransferPayment, type TransferData } from "@/components/transfer-payment"

export function ReservaTransfer(props: { bookingId: string; amount: number; transfer: TransferData }) {
  const router = useRouter()
  return <TransferPayment {...props} onSent={() => router.refresh()} />
}
