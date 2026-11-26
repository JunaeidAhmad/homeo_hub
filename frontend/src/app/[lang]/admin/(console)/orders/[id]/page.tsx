import { OrderDesk } from "@/areas/admin/orders/OrderDesk";

export default async function Page({ params }: PageProps<"/[lang]/admin/orders/[id]">) {
  const { id } = await params;
  return <OrderDesk orderId={id} />;
}
