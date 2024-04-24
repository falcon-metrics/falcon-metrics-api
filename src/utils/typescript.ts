export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type OptionalExcept<T, K extends keyof T> = Pick<T, K> &
    Omit<Partial<T>, K>;

export type ReplaceKeyTypes<Original extends Object, New extends Object> = Omit<
    Original,
    keyof New
> &
    New;

type FilterFlags<Base, Condition> = {
    [Key in keyof Base]: Base[Key] extends Condition ? Key : never;
};

/**
 * Returns the list of keys in the @param Base type that extend the @param Condition type.
 */
export type AllowedNames<Base, Condition> = FilterFlags<
    Base,
    Condition
>[keyof Base];

export type SubType<Base, Condition> = Pick<
    Base,
    AllowedNames<Base, Condition>
>;

export type WithoutKeys<T, ReservedAttributes> = Omit<
    T,
    keyof ReservedAttributes
> &
    {
        [P in Extract<keyof T, keyof ReservedAttributes>]?: never;
    };

export type RequiredKeys<
    T extends Record<string | number | symbol, unknown>
> = {
        [K in keyof Required<T>]: Exclude<T[K], undefined> extends Record<
            string | number | symbol,
            unknown
        >
        ? RequiredKeys<Exclude<T[K], undefined>>
        : T[K];
    };

export type ArrayItemType<T extends unknown[]> = T extends (infer U)[]
    ? U
    : never;

export function asRequiredKeys<
    T extends Record<string | number | symbol, unknown>
>(obj: T) {
    return obj as RequiredKeys<T>;
}

export function isObject(
    arg: unknown,
): arg is Record<string | symbol | number, unknown> {
    return typeof arg === 'object' && arg !== null;
}

export function isStringRecord(arg: unknown): arg is Record<string, unknown> {
    return (
        isObject(arg) && !Object.keys(arg).some((k) => typeof k !== 'string')
    );
}

export const isDefined = <T>(input: T | undefined | null): input is T => {
    return typeof input !== 'undefined' && input !== null;
};

export function asTuple<T extends Array<unknown>>(...args: T): T {
    return args;
}

export function isKeyOf<T>(
    key: string | number | symbol,
    obj: Record<any, any>,
): boolean {
    return key in obj;
}
