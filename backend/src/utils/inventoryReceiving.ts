export function receiptChanges(items: { quantity: number; receivedQuantity?: number }[], received: number[]) {
    if (!items.length || received.length !== items.length) throw new Error('Provide the total received quantity for every item.');
    const deltas = items.map((item, index) => {
        const value = received[index];
        if (!Number.isFinite(value) || value < (item.receivedQuantity || 0) || value > item.quantity) {
            throw new Error(`Item ${index + 1}: received quantity must be between ${item.receivedQuantity || 0} and ${item.quantity}.`);
        }
        return Number((value - (item.receivedQuantity || 0)).toPrecision(15));
    });
    const deliveryStatus = received.every((value, index) => value === items[index].quantity) ? 'complete' : received.some(value => value > 0) ? 'partial' : 'not_received';
    return { deltas, deliveryStatus };
}
