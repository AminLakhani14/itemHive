import mongoose, { Schema } from 'mongoose';
import type { MenuDesign } from '../utils/menuDesign';
import type { MenuBlock } from '../utils/menuContent';
import type { MenuPrices } from '../utils/menuPrices';

export type PublishedDeal = { _id: string; name: string; productIds: string[]; dealPrice?: number };
export type PublishedMenu = {
    _id: string; name: string; productIds: string[]; design?: MenuDesign;
    content?: MenuBlock[]; pageCount?: number; productPrices?: MenuPrices; deals: PublishedDeal[];
};

// One document per workspace makes switching publication atomic, including
// concurrent requests. Draft edits never overwrite the published snapshot.
const schema = new Schema<{ _id: string; menu: PublishedMenu | null; publishedAt?: Date }>({
    _id: { type: String, required: true },
    menu: { type: Schema.Types.Mixed, default: null },
    publishedAt: Date,
});

export default mongoose.model('MenuPublication', schema);
