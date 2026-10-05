import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StyleSheet } from 'react-native';

import { TabBarContainer, TabButton } from '@/features/navigation/SPointTabBar';

export default function TabsLayout() {
  return (
    <Tabs style={styles.fill}>
      <TabSlot style={styles.fill} />
      <TabList asChild>
        <TabBarContainer>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="compass-outline" activeIcon="compass" label="Explorar" />
          </TabTrigger>
          <TabTrigger name="favorites" href="/favorites" asChild>
            <TabButton icon="heart-outline" activeIcon="heart" label="Favoritos" />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon="account-circle-outline" activeIcon="account-circle" label="Perfil" />
          </TabTrigger>
        </TabBarContainer>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
