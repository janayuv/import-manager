// src/components/boe/data.ts (MODIFIED)
import type { BoeDetails } from "@/types/boe";

// This is no longer needed
// export const paymentStatuses = [ ... ];

export const dummyBoes: BoeDetails[] = [
    {
        id: "BOE-001",
        beNumber: "3555019",
        beDate: "2022-12-01",
        location: "INMAA4",
        totalAssessmentValue: 8922,
        dutyAmount: 4382,
        paymentDate: "2022-12-02", // Changed from paymentStatus
        dutyPaid: 4384,
        challanNumber: "2041914258",
        refId: "IG021222110722300061",
        transactionId: "20221202794693",
    },
    {
        id: "BOE-002",
        beNumber: "3576502",
        beDate: "2022-12-03",
        location: "INMAA1",
        totalAssessmentValue: 3145234,
        dutyAmount: 1102090,
        paymentDate: "2022-12-05", // Changed from paymentStatus
        dutyPaid: 1107996,
        challanNumber: "2041933832",
        refId: "IG051222084121253731",
        transactionId: "20221205865852",
    },
    {
        id: "BOE-003",
        beNumber: "3683116",
        beDate: "2022-12-10",
        location: "INMAA1",
        totalAssessmentValue: 2548134,
        dutyAmount: 982560,
        // No paymentDate means it's unpaid
    },
];