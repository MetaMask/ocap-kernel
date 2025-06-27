import { Fail } from '@endo/errors';
import { E, Far } from '@endo/far';

export function buildRootObject(
  _,
  { initialBalance, maxPayment, serviceName, serviceArgs },
) {
  let aggregator;
  let balance = initialBalance;
  const makePayable = (maxPrice) =>
    Far('payable', {
      request: (price) => {
        // eslint-disable-next-line no-unused-expressions
        price <= maxPrice || Fail`Unauthorized withdrawal`;
        // eslint-disable-next-line no-unused-expressions
        price <= balance || Fail`Insufficient funds`;
        balance -= price;
      },
    });
  return Far('root', {
    introduceAggregator: async (introduced) => (aggregator = introduced),
    run: async () => {
      console.log(`requesting service ${serviceName}`);
      const service = E(aggregator).requestService(serviceName);
      console.log(`executing service with args ${serviceArgs}`);
      const payment = makePayable(maxPayment);
      const result = await E(service).request(payment, serviceArgs);
      console.log(`service result: ${result}`);
      return result;
    },
  });
}
