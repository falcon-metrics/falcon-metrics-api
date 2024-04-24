//the trailing \x1b[0m resets the color back to default after the string is printed
//otherwise the color would persist on following output
export enum FG_COLOR {
    BLACK = '\x1b[30m%s\x1b[0m',
    RED = '\x1b[31m%s\x1b[0m',
    GREEN = '\x1b[32m%s\x1b[0m',
    YELLOW = '\x1b[33m%s\x1b[0m',
    BLUE = '\x1b[34m%s\x1b[0m',
    MAGENTA = '\x1b[35m%s\x1b[0m',
    CYAN = '\x1b[36m%s\x1b[0m',
    WHITE = '\x1b[37m%s\x1b[0m',
}
