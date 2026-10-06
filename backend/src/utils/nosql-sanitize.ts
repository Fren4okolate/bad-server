import BadRequestError from "../errors/bad-request-error";

const ALLOWED_OPERATORS = ['$eq']; 

export const hasNoSQLInjection = (str: string): boolean => {
    const dangerousPatterns = [
        /\$[a-z]/i,                   
        /\[.*\]/,                      
        /\{.*\}/,                      
        /\$or|\$and|\$nor/i,          
        /\$where|\$expr/i,             
        /this\./i,                     
        /function/i,                   
        /while.*\(/i,                 
        /sleep.*\(/i,                 
        /benchmark/i                   
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(str));
};

export const sanitizeFilter = (filter: any): any => {
    if (!filter || typeof filter !== 'object') {
        return filter;
    }

    if (Array.isArray(filter)) {
        return filter.map(item => sanitizeFilter(item));
    }

    return Object.keys(filter).reduce((acc: any, key) => {
        if (key.startsWith('$') && !ALLOWED_OPERATORS.includes(key)) {
            return acc; 
        }

        const value = filter[key];
        
        const sanitizedValue = (value && typeof value === 'object') 
            ? sanitizeFilter(value) 
            : value;
        
        return {
            ...acc,
            [key]: sanitizedValue
        };
    }, {});
};

export const escapeRegex = (str: string): string => {
    if (typeof str !== 'string') {
        return '';
    }
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const createSafeRegex = (pattern: string, flags = 'i'): RegExp => {
    if (typeof pattern !== 'string') {
        return new RegExp('', flags);
    }
    const escapedPattern = escapeRegex(pattern);
    return new RegExp(escapedPattern, flags);
};

export const sanitizeString = (str: string): string => {
    if (hasNoSQLInjection(str)) {
        throw new Error('Обнаружена попытка NoSQL-инъекции');
    }
    return str;
};

export const sanitizeQueryParams = (query: any): any => {
    const sanitized: any = {};
    
    Object.keys(query).forEach((key) => {
        const value = query[key];
        
        if (hasNoSQLInjection(key)) {
            throw new Error(`Обнаружена NoSQL-инъекция в параметре: ${key}`);
        }
        
        if (typeof value === 'string' && hasNoSQLInjection(value)) {
            throw new Error(`Обнаружена NoSQL-инъекция в значении: ${value}`);
        }
        
        sanitized[key] = value;
    });
    
    return sanitized;
};

export const deepCheckNoSQLInjection = (obj: any, path: string = ''): void => {
    if (!obj || typeof obj !== 'object') {
        return;
    }

    Object.keys(obj).forEach(key => {
        const currentPath = path ? `${path}.${key}` : key;
        const value = obj[key];

        if (hasNoSQLInjection(key)) {
            throw new Error(`Обнаружена NoSQL-инъекция в пути: ${currentPath}`);
        }
        if (typeof value === 'string' && hasNoSQLInjection(value)) {
            throw new Error(`Обнаружена NoSQL-инъекция в значении: ${currentPath} = ${value}`);
        }

        if (value && typeof value === 'object') {
            deepCheckNoSQLInjection(value, currentPath);
        }
    });
};


export const sanitizeRequestQuery = (query: any): any => {
    try {
        deepCheckNoSQLInjection(query);
        
        return sanitizeFilter(query);
    } catch (error) {
        throw new BadRequestError('Обнаружена попытка NoSQL-инъекции');
    }
};

export const checkRawQueryString = (queryString: string): void => {
    const dangerousOperators = [
        '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$regex',
        '$where', '$exists', '$or', '$and', '$not', '$nor', '$elemMatch',
        '$all', '$size', '$type', '$mod', '$text', '$expr'
    ];

    const searchParamRegex = /search=[^&]*/g;
    const queryWithoutSearch = queryString.replace(searchParamRegex, '');
    
    const hasDangerousOperator = dangerousOperators.some(operator => 
        queryWithoutSearch.includes(`${operator}=`) || 
        queryWithoutSearch.includes(`[${operator}]`) ||
        queryWithoutSearch.includes(`{"${operator}"`)
    );
    
    if (hasDangerousOperator) {
        throw new BadRequestError('Обнаружена попытка NoSQL-инъекции');
    }
};