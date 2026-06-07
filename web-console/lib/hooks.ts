'use client';

/**
 * SWR data hooks over the BFF. Each returns the rows plus loading/error state,
 * and accepts a `fallback` (seed data) so screens render instantly and never
 * blank out when a resource is empty or the upstream is briefly unreachable.
 */

import useSWR, { type SWRConfiguration } from 'swr';
import { listResource, getAggregate, type QueryParams } from '@/lib/api/resources';
import type { ListResponse } from '@/lib/types';

const listFetcher = <T,>([, resource, params]: [string, string, QueryParams | undefined]) =>
  listResource<T>(resource, params);

/** Live list of a resource with a seed fallback. */
export function useResourceList<T>(
  resource: string,
  params?: QueryParams,
  fallback?: T[],
  config?: SWRConfiguration,
): { data: T[]; isLoading: boolean; error: unknown; mutate: () => void } {
  const { data, error, isLoading, mutate } = useSWR<ListResponse<T>>(
    ['list', resource, params],
    listFetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, keepPreviousData: true, ...config },
  );
  const rows = data?.data ?? fallback ?? [];
  return { data: rows, isLoading: isLoading && !data, error, mutate: () => void mutate() };
}

/** The first organization's id — used as the default org scope for new records. */
export function useDefaultOrgId(): string | undefined {
  const { data } = useResourceList<{ id: string }>('organizations', { limit: 1 });
  return data[0]?.id;
}

/** The first role's id — convenience default for role-scoped link records. */
export function useDefaultRoleId(): string | undefined {
  const { data } = useResourceList<{ id: string }>('roles', { limit: 1 });
  return data[0]?.id;
}

const aggFetcher = <T,>([, metric, params]: [string, string, QueryParams | undefined]) =>
  getAggregate<T>(metric, params);

/** Live server-side aggregate metric with a seed fallback. */
export function useAggregate<T>(
  metric: string,
  params?: QueryParams,
  fallback?: T,
  config?: SWRConfiguration,
): { data: T | undefined; isLoading: boolean; error: unknown } {
  const { data, error, isLoading } = useSWR<T>(['agg', metric, params], aggFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 30000,
    keepPreviousData: true,
    ...config,
  });
  return { data: data ?? fallback, isLoading: isLoading && data === undefined, error };
}
