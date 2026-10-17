export interface OrderDraftItem {
    sizeId?: string;
    selectedSize?: number | string;
    productUnit?: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
}

export interface OrderDraft {
    salespersonEmployeeId?: string;
    _id: string;
    draftCode: string;
    items: OrderDraftItem[];
    discountPercent: number;
    orderType?: string;
    otherOrderType?: string;
    deliveryNumber?: string;
    /** Present when this draft was created/merged from a table QR menu. */
    digitalMenuTable?: string;
    createdByName: string;
    createdAt: string;
    updatedAt: string;
}
