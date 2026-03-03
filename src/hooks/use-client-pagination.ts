import { useEffect, useState } from "react";

interface ClientPaginationResult<T> {
  paginatedItems: T[];
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
}

export function useClientPagination<T>(
  items: T[],
  pageSize = 20,
): ClientPaginationResult<T> {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(items.length / pageSize);

  // Clamp page when items shrink (e.g. after delete)
  const safePage = Math.min(currentPage, totalPages || 1);

  const start = (safePage - 1) * pageSize;
  const paginatedItems = items.slice(start, start + pageSize);

  // Reset to page 1 when the source array identity changes
  useEffect(() => {
    setCurrentPage(1);
  }, [items]);

  return {
    paginatedItems,
    currentPage: safePage,
    setCurrentPage,
    totalPages,
  };
}
