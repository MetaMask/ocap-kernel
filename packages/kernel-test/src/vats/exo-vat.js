import { makeScalarMapStore, makeScalarSetStore } from '@agoric/store';
import { makeExo, defineExoClass, defineExoClassKit } from '@endo/exo';
import { Far } from '@endo/marshal';
import { M } from '@endo/patterns';

/**
 * Build function for testing exo objects and liveslots virtual object functionality.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, baggage) {
  const vatName = parameters?.name ?? 'anonymous';

  /**
   * Print a message to the log.
   *
   * @param {string} message - The message to print.
   */
  function log(message) {
    console.log(`${vatName}: ${message}`);
  }

  /**
   * Print a message to the log, tagged as part of the test output.
   *
   * @param {string} message - The message to print.
   * @param {...any} args - Additional arguments to print.
   */
  function tlog(message, ...args) {
    if (args.length > 0) {
      console.log(`::> ${vatName}: ${message}`, ...args);
    } else {
      console.log(`::> ${vatName}: ${message}`);
    }
  }

  log(`buildRootObject`);

  // Create stores for testing
  const mapStore = makeScalarMapStore('testMap');
  const setStore = makeScalarSetStore('testSet');

  // Define interfaces for our Exo objects
  const CounterI = M.interface('Counter', {
    getValue: M.call().returns(M.number()),
    increment: M.call(M.optional(M.number())).returns(M.number()),
    decrement: M.call(M.optional(M.number())).returns(M.number()),
  });

  const PersonI = M.interface('Person', {
    getName: M.call().returns(M.string()),
    getAge: M.call().returns(M.number()),
    birthday: M.call().returns(M.number()),
    addFriend: M.call(M.object()).returns(M.number()),
    getFriends: M.call().returns(M.arrayOf(M.object())),
  });

  // Define two facets for a Temperature converter
  const CelsiusI = M.interface('Celsius', {
    getCelsius: M.call().returns(M.number()),
    setCelsius: M.call(M.number()).returns(M.number()),
  });

  const FahrenheitI = M.interface('Fahrenheit', {
    getFahrenheit: M.call().returns(M.number()),
    setFahrenheit: M.call(M.number()).returns(M.number()),
  });

  // Define a simple Counter exo class
  const Counter = defineExoClass(
    'Counter',
    CounterI,
    (initialValue = 0) => ({ value: initialValue }),
    {
      getValue() {
        return this.state.value;
      },
      increment(amount = 1) {
        this.state.value += amount;
        return this.state.value;
      },
      decrement(amount = 1) {
        this.state.value -= amount;
        return this.state.value;
      },
    },
  );

  // Define a Person exo class with more complex state
  const Person = defineExoClass(
    'Person',
    PersonI,
    (name, age) => ({ name, age, friends: [] }),
    {
      getName() {
        return this.state.name;
      },
      getAge() {
        return this.state.age;
      },
      birthday() {
        this.state.age += 1;
        return this.state.age;
      },
      addFriend(friend) {
        this.state.friends.push(friend);
        return this.state.friends.length;
      },
      getFriends() {
        return [...this.state.friends];
      },
    },
  );

  // Use defineExoClassKit to create a Temperature converter with two facets
  const makeTemperatureKit = defineExoClassKit(
    'Temperature',
    { celsius: CelsiusI, fahrenheit: FahrenheitI },
    (initialCelsius = 0) => ({ celsius: initialCelsius }),
    {
      celsius: {
        getCelsius() {
          return this.state.celsius;
        },
        setCelsius(value) {
          this.state.celsius = value;
          return value;
        },
      },
      fahrenheit: {
        getFahrenheit() {
          return (this.state.celsius * 9) / 5 + 32;
        },
        setFahrenheit(value) {
          this.state.celsius = ((value - 32) * 5) / 9;
          return value;
        },
      },
    },
  );

  // Initialize state if not present
  if (baggage.has('initialized')) {
    tlog(`state already initialized`);
  } else {
    baggage.init('initialized', true);
    baggage.init('counterValue', 0);
    tlog(`initializing state`);
  }

  // Create a counter instance stored in baggage
  let counterValue = baggage.get('counterValue');
  tlog(`counter value from baggage: ${counterValue}`);

  // Create a direct exo instance using makeExo
  const simpleCounter = makeExo('SimpleCounter', CounterI, {
    getValue() {
      return counterValue;
    },
    increment(amount = 1) {
      counterValue += amount;
      return counterValue;
    },
    decrement(amount = 1) {
      counterValue -= amount;
      return counterValue;
    },
  });

  return Far('root', {
    async bootstrap() {
      tlog(`bootstrap()`);

      // Test Counter from defineExoClass
      const counter = Counter(10);
      tlog(`Created counter with initial value: ${counter.getValue()}`);
      const newVal = counter.increment(5);
      tlog(`Incremented counter by 5 to: ${newVal}`);

      try {
        counter.increment(-3); // Should fail due to type constraints
        tlog(`ERROR: Increment with negative value should have failed`);
      } catch (error) {
        tlog(
          `Successfully caught error on negative increment: ${error.message}`,
        );
      }

      // Test Person from defineExoClass
      const alice = Person('Alice', 30);
      const bob = Person('Bob', 25);
      alice.addFriend(bob);
      tlog(`${alice.getName()} has ${alice.getFriends().length} friends`);

      // Test map store
      mapStore.set('alice', alice);
      mapStore.set('bob', bob);
      tlog(`Added ${mapStore.size} entries to map store`);

      // Test set store
      setStore.add(alice);
      setStore.add(bob);
      tlog(`Added ${setStore.size} entries to set store`);

      // Test retrieving from stores
      const retrievedAlice = mapStore.get('alice');
      tlog(`Retrieved ${retrievedAlice.getName()} from map store`);

      // Test Temperature from defineExoClassKit
      const { celsius, fahrenheit } = makeTemperatureKit(25);
      tlog(`Temperature at 25°C = ${fahrenheit.getFahrenheit()}°F`);

      fahrenheit.setFahrenheit(68);
      tlog(`After setting to 68°F, celsius is ${celsius.getCelsius()}°C`);

      // Test direct exo object with makeExo
      tlog(`SimpleCounter initial value: ${simpleCounter.getValue()}`);
      const simpleIncremented = simpleCounter.increment(7);
      tlog(`SimpleCounter after +7: ${simpleIncremented}`);

      // Test persistence
      counterValue = simpleCounter.getValue();
      baggage.set('counterValue', counterValue);
      tlog(`Updated baggage counter to: ${counterValue}`);

      return 'exo-test-complete';
    },

    createCounter(initialValue = 0) {
      const counter = Counter(initialValue);
      tlog(`Created new counter with value: ${initialValue}`);
      return counter;
    },

    createPerson(name, age) {
      const person = Person(name, age);
      tlog(`Created person ${name}, age ${age}`);
      return person;
    },

    createTemperature(initialCelsius = 0) {
      const temperature = makeTemperatureKit(initialCelsius);
      tlog(`Created temperature converter starting at ${initialCelsius}°C`);
      return temperature;
    },

    addToMap(key, value) {
      mapStore.set(key, value);
      tlog(`Added ${key} to map, size now: ${mapStore.size}`);
      return mapStore.size;
    },

    getFromMap(key) {
      if (mapStore.has(key)) {
        tlog(`Found ${key} in map`);
        return mapStore.get(key);
      }
      tlog(`${key} not found in map`);
      return null;
    },

    addToSet(value) {
      setStore.add(value);
      tlog(`Added item to set, size now: ${setStore.size}`);
      return setStore.size;
    },

    hasInSet(value) {
      const result = setStore.has(value);
      tlog(`Checking if item exists in set: ${result}`);
      return result;
    },

    testExoClass() {
      const counter = Counter(3);
      let result = counter.increment(5);
      tlog(`Counter: 3 + 5 = ${result}`);

      result = counter.decrement(2);
      tlog(`Counter: 8 - 2 = ${result}`);

      try {
        // @ts-expect-error Intentionally passing a string to test validation
        counter.increment('foo');
        tlog(`ERROR: Increment with string should have failed`);
      } catch (error) {
        tlog(`Successfully caught type error: ${error.message}`);
      }

      return 'exoClass-tests-complete';
    },

    testExoClassKit() {
      const { celsius, fahrenheit } = makeTemperatureKit(20);

      tlog(`20°C = ${fahrenheit.getFahrenheit()}°F`);

      fahrenheit.setFahrenheit(32);
      tlog(`32°F = ${celsius.getCelsius()}°C`);

      // Access between facets should not work
      try {
        // @ts-expect-error Testing for expected runtime failure
        celsius.getFahrenheit();
        tlog(`ERROR: Cross-facet access should have failed`);
      } catch (error) {
        tlog(`Successfully caught cross-facet error: ${error.message}`);
      }

      return 'exoClassKit-tests-complete';
    },

    testScalarStore() {
      // Test map store operations
      const person = Person('Charlie', 40);
      mapStore.set('charlie', person);
      tlog(`Map store size: ${mapStore.size}`);
      tlog(`Map store keys: ${[...mapStore.keys()].join(', ')}`);
      tlog(`Map has 'charlie': ${mapStore.has('charlie')}`);

      // Test set store operations
      setStore.add(person);
      tlog(`Set store size: ${setStore.size}`);
      tlog(`Set has Charlie: ${setStore.has(person)}`);

      return 'scalar-store-tests-complete';
    },

    resume() {
      tlog(`resume()`);
      tlog(`Counter value after restart: ${counterValue}`);
      tlog(`SimpleCounter value after restart: ${simpleCounter.getValue()}`);
      tlog(`Map store size after restart: ${mapStore.size}`);
      tlog(`Set store size after restart: ${setStore.size}`);

      return `resume ${vatName}`;
    },
  });
}
