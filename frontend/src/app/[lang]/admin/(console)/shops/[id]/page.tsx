import { ShopPriceList } from "@/areas/admin/shops/ShopPriceList";

export default async function Page({ params }: PageProps<"/[lang]/admin/shops/[id]">) {
  const { id } = await params;
  return <ShopPriceList shopId={id} />;
}
