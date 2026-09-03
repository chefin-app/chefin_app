import { fireEvent, render, screen } from '@testing-library/react-native';

import BottomTabBarUser from '@/src/components/navigation/BottomTabBarUser';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const routes = [
  { key: 'home-key', name: 'home' },
  { key: 'search-key', name: 'search' },
  { key: 'account-key', name: 'account' },
];

const descriptors = Object.fromEntries(
  routes.map(route => [route.key, { options: { title: route.name } }])
);

describe('BottomTabBarUser search double tap', () => {
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests input focus after two quick Search presses', () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const onSearchDoubleTap = jest.fn();

    render(
      <BottomTabBarUser
        state={{ routes, index: 1 }}
        descriptors={descriptors}
        navigation={navigation}
        onSearchDoubleTap={onSearchDoubleTap}
      />
    );

    fireEvent.press(screen.getByText('search'));
    expect(onSearchDoubleTap).not.toHaveBeenCalled();

    now = 1_300;
    fireEvent.press(screen.getByText('search'));
    expect(onSearchDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('also recognizes the double tap while navigation is switching from Home', () => {
    let now = 2_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const onSearchDoubleTap = jest.fn();

    render(
      <BottomTabBarUser
        state={{ routes, index: 0 }}
        descriptors={descriptors}
        navigation={navigation}
        onSearchDoubleTap={onSearchDoubleTap}
      />
    );

    fireEvent.press(screen.getByText('search'));
    now = 2_300;
    fireEvent.press(screen.getByText('search'));

    expect(navigation.navigate).toHaveBeenCalledWith({ name: 'search', merge: true });
    expect(onSearchDoubleTap).toHaveBeenCalledTimes(1);
  });
});
