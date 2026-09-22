import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Item } from '@shared/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/inhouse';
import { ItemForm } from '@/components/items/item-form';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';

export const Route = createFileRoute('/items/new')({ component: NewItem });

function NewItem() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <div className="space-y-5">
      <PageHeader title={t('items.newTitle')} description={t('items.newDescription')} />
      <Card className="shadow-xs">
        <CardContent>
          <ItemForm
            submitLabel={t('action.save')}
            onCancel={() => void navigate({ to: '/items' })}
            onSubmit={async (input) => {
              const created = await api.post('/api/items', Item, input);
              // Every list of items is now wrong by one row.
              await queryClient.invalidateQueries({ queryKey: ['items'] });
              toast.success(t('items.saved'));
              void navigate({ to: '/items/$id', params: { id: created.id } });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
