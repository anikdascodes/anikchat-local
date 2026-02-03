// Custom type declarations for react-window v2.x
// This file provides types for the newer API since @types/react-window is for v1.x

declare module 'react-window' {
    import { ComponentType, CSSProperties, ReactElement, RefObject } from 'react';

    export interface ListChildComponentProps<T = unknown> {
        index: number;
        style: CSSProperties;
        data?: T;
    }

    export interface RowComponentProps<T = unknown> {
        index: number;
        style: CSSProperties;
        messages?: unknown[];
        isLoading?: boolean;
        onRegenerate?: () => void;
        onEditMessage?: (messageId: string, newContent: string) => void;
        ariaAttributes?: {
            'aria-posinset': number;
            'aria-setsize': number;
            role: 'listitem';
        };
    }

    export interface ListProps<T = unknown> {
        height: number;
        width: number;
        rowCount: number;
        rowHeight: number | ((index: number) => number);
        children?: ComponentType<ListChildComponentProps<T>>;
        rowComponent?: ComponentType<RowComponentProps<T>>;
        rowProps?: T;
        className?: string;
        style?: CSSProperties;
        ref?: RefObject<List<T>>;
    }

    export interface List<T = unknown> {
        scrollToRow(index: number): void;
        scrollTo(scrollOffset: number): void;
        _outerRef?: HTMLElement;
    }

    export function List<T = unknown>(props: ListProps<T>): ReactElement;

    export interface DynamicRowHeightOptions {
        estimatedRowHeight?: number;
        defaultRowHeight?: number;
        key?: string | number;
    }

    export function useDynamicRowHeight(options: DynamicRowHeightOptions): number | ((index: number) => number);
}
