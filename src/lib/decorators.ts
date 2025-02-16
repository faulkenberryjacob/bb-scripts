// Decorator to log the execution time of a method
export function logExecutionTime(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function(...args: any[]) {
        const start = Date.now();
        const result = originalMethod.apply(this, args);
        const end = Date.now();
        console.log(`Execution time for ${propertyKey}: ${end - start}ms`);
        return result;
    };

    return descriptor;
}